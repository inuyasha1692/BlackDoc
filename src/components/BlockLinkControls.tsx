import { isTableCellSelection } from "@blocknote/core";
import {
  DEFAULT_LINK_PROTOCOL,
  FormattingToolbarExtension,
  LinkToolbarExtension,
  ShowSelectionExtension,
  VALID_LINK_PROTOCOLS,
} from "@blocknote/core/extensions";
import {
  FormattingToolbar,
  type FormattingToolbarProps,
  getFormattingToolbarItems,
  type LinkToolbarProps,
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
  useExtension,
} from "@blocknote/react";
import { Link2, Type } from "lucide-react";
import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import { createBlockLink, parseBlockLink } from "../editor/blockLinks";

const normalizeLink = (url: string): string => {
  const blockId = parseBlockLink(url);
  if (blockId) {
    return createBlockLink(blockId);
  }

  if (VALID_LINK_PROTOCOLS.some((protocol) => url.startsWith(protocol))) {
    return url;
  }
  return `${DEFAULT_LINK_PROTOCOL}://${url}`;
};

type BlockLinkFormProps = Pick<
  LinkToolbarProps,
  "url" | "text" | "range" | "setToolbarOpen" | "setToolbarPositionFrozen"
> & {
  showTextField?: boolean;
};

const BlockLinkForm = (props: BlockLinkFormProps) => {
  const Components = useComponentsContext()!;
  const { editLink } = useExtension(LinkToolbarExtension);
  const [url, setUrl] = useState(props.url);
  const [text, setText] = useState(props.text);

  const submit = useCallback(() => {
    editLink(normalizeLink(url), text, props.range.from);
    props.setToolbarOpen?.(false);
    props.setToolbarPositionFrozen?.(false);
  }, [editLink, props, text, url]);

  const handleEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Components.Generic.Form.Root>
      <Components.Generic.Form.TextInput
        autoFocus={true}
        className="bn-text-input"
        icon={<Link2 aria-hidden="true" size={16} />}
        name="url"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setUrl(event.currentTarget.value)
        }
        onKeyDown={handleEnter}
        onSubmit={submit}
        placeholder="粘贴链接或块链接"
        value={url}
      />
      {props.showTextField !== false && (
        <Components.Generic.Form.TextInput
          className="bn-text-input"
          icon={<Type aria-hidden="true" size={16} />}
          name="title"
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            setText(event.currentTarget.value)
          }
          onKeyDown={handleEnter}
          onSubmit={submit}
          placeholder="链接文字"
          value={text}
        />
      )}
    </Components.Generic.Form.Root>
  );
};

export const BlockDocEditLinkButton = (
  props: Pick<
    LinkToolbarProps,
    "url" | "text" | "range" | "setToolbarOpen" | "setToolbarPositionFrozen"
  >,
) => {
  const Components = useComponentsContext()!;

  return (
    <Components.Generic.Popover.Root
      onOpenChange={props.setToolbarPositionFrozen}
    >
      <Components.Generic.Popover.Trigger>
        <Components.LinkToolbar.Button
          className="bn-button"
          isSelected={false}
          mainTooltip="编辑链接"
        >
          编辑
        </Components.LinkToolbar.Button>
      </Components.Generic.Popover.Trigger>
      <Components.Generic.Popover.Content
        className="bn-popover-content bn-form-popover"
        variant="form-popover"
      >
        <BlockLinkForm key={`${props.range.from}:${props.url}`} {...props} />
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  );
};

const BlockDocCreateLinkButton = () => {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  const formattingToolbar = useExtension(FormattingToolbarExtension);
  const { showSelection } = useExtension(ShowSelectionExtension);
  const [open, setOpen] = useState(false);
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (
        !currentEditor.isEditable ||
        isTableCellSelection(currentEditor.prosemirrorState.selection)
      ) {
        return undefined;
      }

      const blocks = currentEditor.getSelection()?.blocks ?? [
        currentEditor.getTextCursorPosition().block,
      ];
      if (!blocks.some((block) => block.content !== undefined)) {
        return undefined;
      }

      return {
        url: currentEditor.getSelectedLinkUrl() ?? "",
        text: currentEditor.getSelectedText(),
        range: {
          from: currentEditor.prosemirrorState.selection.from,
          to: currentEditor.prosemirrorState.selection.to,
        },
      };
    },
  });

  useEffect(() => {
    showSelection(open, "blockDocCreateLinkButton");
    return () => showSelection(false, "blockDocCreateLinkButton");
  }, [open, showSelection]);

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        setOpen(true);
        event.preventDefault();
      }
    };
    editor.domElement?.addEventListener("keydown", handleShortcut);
    return () => editor.domElement?.removeEventListener("keydown", handleShortcut);
  }, [editor]);

  if (!state) {
    return null;
  }

  return (
    <Components.Generic.Popover.Root open={open} onOpenChange={setOpen}>
      <Components.Generic.Popover.Trigger>
        <Components.FormattingToolbar.Button
          className="bn-button"
          data-test="createLink"
          icon={<Link2 aria-hidden="true" size={17} />}
          label="添加链接"
          mainTooltip="添加链接"
          onClick={() => setOpen((current) => !current)}
        />
      </Components.Generic.Popover.Trigger>
      <Components.Generic.Popover.Content
        className="bn-popover-content bn-form-popover"
        variant="form-popover"
      >
        <BlockLinkForm
          {...state}
          setToolbarOpen={(nextOpen) =>
            formattingToolbar.store.setState(nextOpen)
          }
          showTextField={false}
        />
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  );
};

export const BlockDocFormattingToolbar = (
  props: FormattingToolbarProps,
) => (
  <FormattingToolbar {...props}>
    {getFormattingToolbarItems(props.blockTypeSelectItems).map((item) =>
      item.key === "createLinkButton" ? (
        <BlockDocCreateLinkButton key="createLinkButton" />
      ) : (
        item
      ),
    )}
  </FormattingToolbar>
);
