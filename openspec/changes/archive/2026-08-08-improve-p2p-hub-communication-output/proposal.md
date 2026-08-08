## Why

The p2p-hub tools currently use Pi's fallback rendering, which hides call arguments from users, duplicates diagnostic roster data in model context, and leaves non-triggering `p2p_send` messages unattributed because sender identity exists only in metadata that neither the TUI nor model consumes. The communication surfaces should give agents concise, complete context while giving users clear, inspectable call, result, and inbound-message presentation.

## What Changes

- Add custom call and result rendering for `p2p_send` and `p2p_ask`, including target, delivery mode, compact message or prompt previews, expandable full text, responder identity, and visibly distinct failures.
- Make every inbound peer message self-attributing in model-facing textual content, including non-triggering sends, triggering batches, and remote prompts.
- Add structured inbound-message metadata and a custom `p2p_hub` message renderer for sender, delivery mode, batching, and remote-prompt presentation.
- Keep `p2p_ask` model-facing success output as the remote agent's raw final response while presenting reply provenance in the user renderer.
- Clarify `p2p_send` confirmations as transport acceptance rather than proof that the recipient read or processed the message.
- **BREAKING**: Reduce `p2p_ls` human-readable and structured tool output to routing-relevant fields: hub name, member name, self marker, status, description, and cwd. Remove model, context usage, progress bars, and `connectionType` from this tool output; model and context remain available in the persistent hub widget and hub detail UI.
- Apply bounded previews and standard output truncation behavior so large messages and remote responses do not overwhelm the TUI or model context.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `p2p-hub-tools`: Refine agent-facing tool results, user-facing tool and inbound-message rendering, peer attribution, roster fields, delivery confirmations, errors, and output bounds.

## Impact

Affected areas include p2p tool definitions and helpers, inbound runtime bindings, message batching and metadata, custom TUI renderers, formatting utilities, the structured `p2p_ls` result contract, p2p-hub tool/message/state tests, and user-facing documentation or changelog entries. No new runtime dependency or wire-protocol message type is required, though internal message metadata shapes and the structured `p2p_ls` result change.
