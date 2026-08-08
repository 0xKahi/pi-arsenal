## 1. Shared Communication Presentation

- [x] 1.1 Define a discriminated structured-details shape for inbound peer messages, triggering batches, and remote prompts, including ordered sender/content items and delivery behavior.
- [x] 1.2 Add shared model-facing envelope and bounded-preview formatting helpers so sender attribution and preview rules are consistent across send, batch, and ask paths.
- [x] 1.3 Implement and register a width-safe `p2p_hub` custom message renderer for single steers, triggering batches, and remote prompts, including collapsed and expanded behavior where applicable.

## 2. Inbound Delivery Paths

- [x] 2.1 Update non-triggering `p2p_send` delivery so textual content identifies the sender and structured metadata drives the steer presentation without starting a turn.
- [x] 2.2 Update idle-gated triggering batches so model-facing text and structured details preserve the count, ordering, sender, and content of every item.
- [x] 2.3 Deliver accepted `p2p_ask` requests as attributed custom p2p messages that trigger a turn, while preserving busy rejection, pending-request correlation, final assistant-text extraction, and response transmission.

## 3. Tool Calls and Results

- [x] 3.1 Add `p2p_send` call rendering for target, steer versus trigger-when-idle mode, bounded collapsed preview, and expanded full message.
- [x] 3.2 Refine `p2p_send` model-facing confirmations and result rendering so success describes transport acceptance and delivery behavior without implying read, processing, or acknowledgement; render structured operational errors distinctly.
- [x] 3.3 Add `p2p_ask` call rendering for target, bounded collapsed preview, and expanded full prompt, plus result rendering that identifies the responder for users while preserving raw reply text for the caller model.
- [x] 3.4 Normalize `p2p_ask` operational error details and rendering without changing the established non-throwing tool contract.
- [x] 3.5 Apply Pi's standard line and byte truncation limits to remote `p2p_ask` replies and append an explicit truncation notice when a limit is exceeded.
- [x] 3.6 Reduce `p2p_ls` textual and structured member output to hub name, name, self marker, status, description, and cwd, removing model, context, progress bars, connection type, and legacy role fields.

## 4. Verification

- [x] 4.1 Add formatting and renderer tests for collapsed previews, expanded text, narrow widths, delivery labels, responder identity, batches, and error styling.
- [x] 4.2 Update p2p state and extension tests to verify sender attribution reaches both textual content and structured details for non-triggering sends, triggering batches, and remote prompts.
- [x] 4.3 Update tool tests for the reduced `p2p_ls` contract, precise `p2p_send` confirmations, raw successful `p2p_ask` replies, normalized errors, and oversized-reply truncation notices.
- [x] 4.4 Add or update integration coverage proving custom remote prompts still trigger exactly one turn, busy targets receive no injected prompt, and the final assistant text returns to the correct caller.

## 5. Documentation and Validation

- [x] 5.1 Update p2p-hub documentation and changelog notes with the breaking `p2p_ls` structured-output change and the clarified send/ask presentation and acknowledgement semantics.
- [x] 5.2 Run focused p2p-hub tests, the full test suite, type checking, and strict OpenSpec validation; resolve all failures.
- [x] 5.3 Perform a manual two-terminal check of both `p2p_send` modes and successful/error `p2p_ask` flows, verifying sender and receiver user displays against model-facing content.
