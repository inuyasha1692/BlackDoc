"""Source-backed document tree and two output adapters.

The compiler alone resolves source cells, images, styles and links. Adapters
receive a complete tree and cannot infer or change its semantic structure.
"""
from collections import Counter
from copy import deepcopy
from datetime import date, datetime
import html
import re

from excel_to_bdoc import Renderer, block, text, native_color, stable_id

KINDS = {'heading', 'paragraph', 'bullet', 'ordered', 'code', 'image', 'table'}


class DocumentCompiler(Renderer):
    def styles(self, font, fill=None):
        styles = {key: True for key, enabled in [('bold', font.b), ('italic', font.i),
                  ('strike', font.strike), ('underline', font.u)] if enabled}
        color = self.helper.color_hex(font.color)
        if color:
            styles['textColor'] = color
        if fill:
            styles['backgroundColor'] = fill
        return styles

    def content(self, ws, refs, target, *, heading=False, background=None, omit_fill=False):
        output = []
        for index, ref in enumerate(refs):
            ref = {'cell': ref} if isinstance(ref, str) else ref
            coordinate = ref['cell']
            if not re.fullmatch(r'[A-Z]+[1-9][0-9]*', coordinate):
                raise ValueError('Invalid source coordinate: ' + coordinate)
            current = ws[coordinate]
            if current.value is None:
                raise ValueError('Empty source reference: ' + ws.title + '!' + coordinate)
            separator = ref.get('separator', '　' if index else '')
            if separator.strip():
                raise ValueError('Source separators must be whitespace')
            if separator:
                output.append(text(separator))
            items = self.cell(ws, current, target, heading=heading,
                              omit_source_fill=omit_fill or bool(background))
            if ref.get('format'):
                if ref['format'] != 'iso_date' or not isinstance(current.value, (date, datetime)):
                    raise ValueError('Unsupported explicit display format')
                next(self.inline_text(items))['text'] = current.value.strftime('%Y-%m-%d')
            for item in self.inline_text(items):
                for key in ['bold', 'italic', 'strike', 'underline']:
                    if key in ref:
                        if ref[key]:
                            item['styles'][key] = True
                        else:
                            item['styles'].pop(key, None)
            output.extend(items)
        return output

    @staticmethod
    def inline_text(items):
        for item in items:
            if item['type'] == 'text':
                yield item
            elif item['type'] == 'link':
                yield from DocumentCompiler.inline_text(item['content'])

    def picture(self, ws, spec, target=None):
        matches = [i for i in self.images if i['key'] == spec['image'] and i['sheet'] == ws.title]
        if len(matches) != 1:
            raise ValueError('Unknown picture: ' + spec['image'])
        width = spec.get('width', 480)
        if not isinstance(width, int) or not 1 <= width <= 10000:
            raise ValueError('Invalid image width')
        item = matches[0]
        result = super().image(item, in_table=target is not None, width=width)
        if target is not None:
            self.image_mapping.append({'sheet': ws.title, 'row': item['row'],
                                       'column': item['column'], 'block': target})
        props = result['props']
        return {'kind': 'image', 'id': result.get('id', stable_id(self.source_key, item['key'])),
                'url': props['url'], 'name': props['name'], 'width': width, 'children': []}

    def node(self, ws, spec, path):
        kind = spec['kind']
        if kind not in KINDS:
            raise ValueError('Unknown document kind: ' + kind)
        key = spec.get('key', path)
        identifier = stable_id(self.source_key, ws.title, 'document', key)
        if identifier in self.id_keys:
            raise ValueError('Duplicate document key: ' + str(key))
        self.id_keys.add(identifier)
        result = {'id': identifier, 'kind': kind, 'children': []}
        if kind == 'image':
            return self.picture(ws, spec)
        background = spec.get('background')
        refs = spec.get('content', [])
        if kind == 'heading':
            level = spec.get('level', 3)
            if not isinstance(level, int) or not 1 <= level <= 6:
                raise ValueError('Invalid heading level')
            if not spec.get('keep_as_heading'):
                source_rows = {ws[ref if isinstance(ref, str) else ref['cell']].row for ref in refs}
                revisions = self.helper.semantic_revision_blocks(self.plan, ws.title)
                guarded = level >= 5 or any(r['start_row'] <= row <= r['end_row']
                                           for r in revisions for row in source_rows)
                number_kind = getattr(self.helper, 'numbered_heading_kind', None)
                if guarded or (number_kind and any(number_kind(ws, row) for row in source_rows)):
                    raise ValueError('Guarded heading needs keep_as_heading: ' + str(key))
            result['level'] = level
        if background:
            if not re.fullmatch(r'#[0-9a-fA-F]{6}', background):
                raise ValueError('Invalid semantic background')
            result['background'] = background
        if kind == 'table':
            rows = spec['rows']
            if not rows or not rows[0] or len({len(row) for row in rows}) != 1:
                raise ValueError('Document table must be rectangular')
            headers = spec.get('header_rows', 1)
            if not isinstance(headers, int) or not 0 <= headers <= len(rows):
                raise ValueError('Invalid table header rows')
            result['header_rows'] = headers
            result['rows'] = []
            for ri, row in enumerate(rows):
                cells = []
                for cell in row:
                    refs = cell.get('content', [])
                    cell_background = cell.get('background', background)
                    if cell_background and not re.fullmatch(r'#[0-9a-fA-F]{6}', cell_background):
                        raise ValueError('Invalid semantic cell background')
                    cell_content = self.content(ws, refs, identifier, background=cell_background,
                                                omit_fill=spec.get('plain_header', False) and ri < headers)
                    cells.append({'content': cell_content, 'images': [self.picture(ws, image, identifier)
                                  for image in cell.get('images', [])],
                                  **({'background': cell_background} if cell_background else {})})
                result['rows'].append(cells)
        else:
            result['content'] = self.content(ws, refs, identifier, heading=kind == 'heading', background=background)
            if kind == 'code':
                # Code has plain text semantics in both target formats.
                result['content'] = [text(plain(result['content']))]
                result['language'] = spec.get('language', 'text')
            if kind == 'ordered':
                result['start'] = int(spec.get('start', 1))
        result['children'] = [self.node(ws, child, f'{path}/{i}')
                              for i, child in enumerate(spec.get('children', []))]
        return result

    def compile(self):
        if self.plan.get('document_version') != 1:
            raise ValueError('Unsupported document plan version')
        self.image_mapping = []
        self.blocks = [{'id': stable_id(self.source_key, 'title'), 'kind': 'heading',
                        'level': 1, 'content': [text(self.plan['title'])], 'children': []}]
        worksheets = list(self.wb)
        if self.history_sheet is not None:
            worksheets.remove(self.history_sheet)
            worksheets.insert(0, self.history_sheet)
        for ws in worksheets:
            spec = self.plan['sheets'].get(ws.title)
            if not isinstance(spec, dict) or 'document' not in spec:
                raise ValueError('Missing document plan: ' + ws.title)
            heading = {'id': stable_id(self.source_key, ws.title, 'sheet'), 'kind': 'heading',
                       'level': 2, 'content': [text(ws.title)], 'children': []}
            self.blocks.append(heading)
            self.sheet_targets[ws.title] = heading['id']
            self.blocks.extend(self.node(ws, node, str(i)) for i, node in enumerate(spec['document']))
            for skip in spec.get('omitted_cells', []):
                if not skip.get('reason') or ws[skip['cell']].value is None:
                    raise ValueError('Omitted cells require source content and a reason')
                self.skipped.append({'sheet': ws.title, **skip})
            self.reviews.extend({'sheet': ws.title, **r} for r in spec.get('manual_review', []))
        skipped = [s['sheet'] + '!' + s['cell'] for s in self.skipped]
        expected = {ws.title + '!' + c.coordinate for ws in self.wb for row in ws for c in row if c.value is not None}
        if len(skipped) != len(set(skipped)) or set(skipped) & self.mapping.keys():
            raise ValueError('Source both omitted and rendered, or omitted twice')
        if expected != self.mapping.keys() | set(skipped):
            raise ValueError('Document source coverage mismatch: ' + str(sorted(expected - (self.mapping.keys() | set(skipped)))[:10]))
        if Counter(self.image_keys) != Counter(i['key'] for i in self.images):
            raise ValueError('Missing or duplicate document pictures')
        self.blocks = self.resolve_links()
        report = {'source_cells': len(expected), 'rendered_cells': len(self.mapping),
                  'skipped_cells': self.skipped, 'images': len(self.image_keys),
                  'source_map': self.mapping, 'image_map': self.image_mapping, 'manual_review': self.reviews,
                  'reference_differences': self.plan.get('reference_differences', [])}
        tree = {'version': 1, 'nodes': self.blocks, 'provenance': report}
        self.validate_revisions(tree)
        return tree, report

    def validate_revisions(self, tree):
        nodes = {n['id']: n for n in walk(tree['nodes'])}
        for ws in self.wb:
            for revision in self.helper.semantic_revision_blocks(self.plan, ws.title):
                for row in range(revision['start_row'], revision['end_row'] + 1):
                    for cell in ws[row]:
                        if cell.value is not None:
                            target = self.mapping.get(ws.title + '!' + cell.coordinate)
                            expected = revision.get('background', '#fff4cc').lower()
                            if not target or nodes[target].get('background', '').lower() != expected:
                                raise ValueError('Revision source missing semantic background: ' + cell.coordinate)


def walk(nodes):
    for node in nodes:
        yield node
        yield from walk(node.get('children', []))


def plain(content):
    return ''.join(item['text'] if item['type'] == 'text' else plain(item['content']) for item in content)


def bdoc(tree):
    def image_props(node):
        return {'url': node['url'], 'name': node['name'], 'previewWidth': node['width']}

    def convert(node):
        kind = node['kind']
        props = {'backgroundColor': native_color(node.get('background'), True)}
        if kind == 'image':
            result = block('image', ('unused',), props={**image_props(node), 'showPreview': True,
                           'textAlignment': 'left', **props})
        elif kind == 'table':
            rows = []
            for row in node['rows']:
                cells = []
                for cell in row:
                    content = deepcopy(cell['content'])
                    content.extend({'type': 'tableImage', 'props': image_props(i)} for i in cell['images'])
                    cells.append({'type': 'tableCell', 'props': {'backgroundColor': native_color(cell.get('background'), True),
                                  'textColor': 'default', 'textAlignment': 'left'}, 'content': content})
                rows.append({'cells': cells})
            result = block('table', ('unused',), {'type': 'tableContent', 'headerRows': node['header_rows'], 'rows': rows})
        else:
            target = {'bullet': 'bulletListItem', 'ordered': 'numberedListItem', 'code': 'codeBlock'}.get(kind, kind)
            if kind == 'heading':
                props.update(level=node['level'], isToggleable=True)
            elif kind == 'ordered':
                props['start'] = node['start']
            elif kind == 'code':
                if node.get('background'):
                    raise ValueError('Code block background needs an explicit target representation')
                props = {'language': node['language']}
            result = block(target, ('unused',), deepcopy(node['content']), props)
        result['id'] = node['id']
        result['children'] = [convert(c) for c in node['children']]
        return result
    return [convert(n) for n in tree['nodes']]


def markdown(tree):
    targets = set()
    def collect(value):
        if isinstance(value, dict):
            if value.get('type') == 'link' and value['href'].startswith('#block='):
                targets.add(value['href'][7:])
            for item in value.values():
                collect(item)
        elif isinstance(value, list):
            for item in value:
                collect(item)
    collect(tree)
    def inline(items):
        output = []
        for item in items:
            if item['type'] == 'link':
                href = item['href']
                if href.startswith('#block='):
                    href = '#' + href[7:]
                output.append(f'<a href="{html.escape(href, quote=True)}">{inline(item["content"])}</a>')
                continue
            value = html.escape(item['text']).replace('\n', '<br>')
            styles = item.get('styles', {})
            for key, tag in [('bold', 'strong'), ('italic', 'em'), ('strike', 'del'), ('underline', 'u')]:
                if styles.get(key):
                    value = f'<{tag}>{value}</{tag}>'
            css = ';'.join(f'{target}:{styles[key]}' for key, target in [('textColor', 'color'), ('backgroundColor', 'background')] if key in styles)
            output.append(f'<span style="{css}">{value}</span>' if css else value)
        return ''.join(output)

    def image(node):
        return f'<img src="{html.escape(node["url"], quote=True)}" alt="{html.escape(node["name"], quote=True)}" style="width:{node["width"]}px;max-width:100%;height:auto" />'

    def render(node, prefix=''):
        kind = node['kind']
        anchor = prefix + f'<span id="{node["id"]}"></span>\n\n' if node['id'] in targets or kind == 'heading' else ''
        if kind == 'image':
            body = image(node)
        elif kind == 'table':
            rows = []
            for ri, row in enumerate(node['rows']):
                cells = []
                tag = 'th' if ri < node['header_rows'] else 'td'
                for cell in row:
                    bg = cell.get('background')
                    style = f' style="background:{bg}"' if bg else ''
                    value = inline(cell['content']) + ''.join(image(i) for i in cell['images'])
                    cells.append(f'<{tag}{style}>{value}</{tag}>')
                rows.append('<tr>' + ''.join(cells) + '</tr>')
            body = '<table>\n' + '\n'.join(rows) + '\n</table>'
        elif kind == 'code':
            value = plain(node['content'])
            fence = '`' * max(3, max((len(m[0]) + 1 for m in re.finditer(r'`+', value)), default=0))
            body = fence + node['language'] + '\n' + value + '\n' + fence
        else:
            body = inline(node['content'])
            if node.get('background'):
                body = f'<span style="display:block;background:{node["background"]}">{body}</span>'
            marker = '#' * node['level'] + ' ' if kind == 'heading' else '- ' if kind == 'bullet' else str(node['start']) + '. ' if kind == 'ordered' else ''
            body = marker + body
        result = anchor + '\n'.join(prefix + line for line in body.splitlines()) + '\n\n'
        child_prefix = prefix + (' ' * (len(str(node.get('start', 1))) + 2 if kind == 'ordered' else 2) if kind in {'bullet', 'ordered'} else '')
        return result + ''.join(render(c, child_prefix) for c in node['children'])
    return ''.join(render(n) for n in tree['nodes']).rstrip() + '\n'
