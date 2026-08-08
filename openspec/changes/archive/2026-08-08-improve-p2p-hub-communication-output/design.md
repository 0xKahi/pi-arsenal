## Context

See `proposal.md` for motivation. Pi custom tools expose two different result channels: textual `content` is sent to the model and used by fallback rendering, while `details` is session metadata available to custom renderers but is not converted into model context. Custom messages have the same constraint: Pi's model conversion and fallback TUI rendering use their textual content, not arbitrary details.

The current p2p tools define no call or result renderers. `p2p_send` with `triggerTurn: false` puts the sender only in `details.from`, making attribution invisible to both the receiving model and fallback user display. Triggering sends and remote prompts already inline attribution because batching and user-message injection require textual envelopes. `p2p_ls` currently repeats model, context, topology, and progress-bar diagnostics already available in the persistent widget and hub detail UI.

## Goals / Non-Goals

**Goals:**

- Make model-facing p2p content concise but independently understandable.
- Give users inspectable target, mode, prompt/message, provenance, reply, and error presentation.
- Use structured metadata for rendering without making it the sole carrier of semantic information.
- Keep the three tools' output conventions consistent and bounded.
- Preserve the existing p2p wire message types and delivery semantics.

**Non-Goals:**

- Change hub discovery, connection topology, identity resolution, or host promotion.
- Add delivery receipts, read acknowledgements, or return responses from `p2p_send`.
- Change the p2p tool parameter schemas.
- Remove model or context diagnostics from the widget or hub detail modal.
- Expose remote thinking or intermediate tool results through `p2p_ask`.

## Decisions

### D1: Treat textual content as the complete model contract

Every inbound peer message will include a stable textual envelope such as `[Peer message from "name"]`, and remote prompts will retain equivalent requester attribution. Structured details will duplicate provenance for renderers but will never be the only location of information the model needs.

This follows Pi's actual conversion behavior and fixes the non-triggering-send gap. The alternative—relying on `details.from`—cannot work for model context. A renderer-only fix would improve the TUI but leave the receiving agent unable to identify the sender.

### D2: Separate model output from user presentation with custom renderers

`p2p_send` and `p2p_ask` will define custom call and result renderers. Collapsed calls will show the operation, target, delivery mode where applicable, and a one-line bounded preview; expanded calls will show the complete message or prompt. Results will use concise success, reply, and error presentation. A custom `p2p_hub` message renderer will present inbound sends, batches, and remote prompts from structured metadata.

Model-facing results will avoid presentation-only prefixes. In particular, a normal-sized successful `p2p_ask` result remains the remote assistant's raw text, because the model already has the tool target in the preceding call. The alternative—putting decorative arrows, badges, or reply headers into `content`—would spend context tokens without adding model-relevant information.

### D3: Use one structured inbound-message envelope

Inbound custom-message details will use a discriminated shape capable of representing a single peer send, a triggering batch, or a remote prompt. The shared information will include message kind, whether delivery triggers a turn, and an ordered array of `{ from, content }` items. Remote prompts may use a single-item array so the message renderer can share layout and attribution logic.

Remote asks will be injected through a displayable custom p2p message that triggers a turn rather than an ordinary uncustomizable user bubble. Pi converts such custom messages to a user-role model message, so the remote turn and existing `agent_end` response correlation remain intact while the TUI gains custom presentation.

The alternative—keeping remote prompts as ordinary user messages—preserves behavior but prevents consistent p2p-specific rendering.

### D4: Keep transport confirmation distinct from acknowledgement

A successful `p2p_send` result will state that the message was sent or accepted for transport and describe whether it requested a turn. It will not say delivered, read, processed, or acknowledged because the protocol has no recipient acknowledgement. Triggering sends remain fire-and-forget even though the recipient queues them until idle.

Adding delivery receipts is outside this change because it requires wire-protocol and lifecycle semantics beyond presentation.

### D5: Preserve non-throwing operational errors and render them explicitly

The existing tool contract returns structured, non-throwing operational errors, including the disconnected behavior required by the main spec. This change will preserve that compatibility and make custom result renderers inspect `details.error` to use error styling. Error codes and agent-facing messages will be normalized where needed, but the tools will not throw merely to set Pi's `isError` flag.

The alternative—throwing for expected states such as busy, unknown target, or disconnected—would change control semantics, discard useful structured result details unless additional machinery were added, and conflict with the established disconnected contract.

### D6: Make `p2p_ls` a routing roster

Both textual output and member details will retain only hub name, member name, self marker, status, description, and cwd. Model, context usage, progress bars, and host/client connection type will be removed from this tool contract. The self marker is sufficient to avoid invalid self-targeting, while status, description, and cwd support target choice.

Keeping diagnostic fields only in structured details was considered, but no planned tool renderer needs them and downstream consumers would continue depending on a contract the change intends to simplify. The widget and hub detail modal remain the diagnostic surfaces.

### D7: Bound previews separately from model results

Call previews are display-only: collapsed rendering will use a short normalized single-line excerpt, while expanded rendering reads the original complete arguments. This does not compact or truncate what the calling model supplied.

Remote `p2p_ask` responses are untrusted tool output and will use Pi's standard line and byte bounds before entering the caller's context, with an explicit truncation notice. The same retained content will be shown to the caller rather than hiding an unbounded full response in details. This avoids session bloat and keeps user and model views honest about what was returned.

## Risks / Trade-offs

- **[Risk] Removing structured `p2p_ls` fields breaks downstream consumers.** → Mark the change as breaking, update repository tests and docs atomically, and direct diagnostics consumers to the widget or hub detail UI.
- **[Risk] Textual attribution adds tokens to every inbound peer message.** → Use a short stable envelope; provenance is essential context and outweighs the small cost.
- **[Risk] Custom rendering diverges from model-visible content.** → Derive both from the same structured source and test user rendering and model-facing text independently.
- **[Risk] Changing remote prompts from ordinary user messages to custom messages affects turn behavior.** → Preserve user-role model conversion and `triggerTurn: true`, and add integration tests covering prompt execution and response correlation.
- **[Risk] ANSI or long unbroken content damages layouts.** → Reuse Pi TUI width-aware text components, normalize collapsed previews, and test narrow widths and expanded output.
- **[Risk] Truncated remote replies omit useful conclusions.** → Use Pi's standard generous limits and always include an explicit notice; callers can send a follow-up asking for a shorter or segmented answer.

## Migration Plan

1. Introduce shared inbound-message metadata and presentation helpers while retaining the current wire protocol.
2. Switch steer, batch, and remote-prompt runtime bindings to the shared attributed envelopes and renderer metadata.
3. Add tool call/result renderers and output bounds.
4. Reduce the `p2p_ls` textual and structured result contract and update all in-repository consumers and tests atomically.
5. Validate with paired-session tests for both send modes, successful and failed asks, disconnected tools, batching, expansion, and narrow TUI widths.

Rollback can restore the previous renderers and result shapes without a wire migration because no protocol message type changes are introduced.
