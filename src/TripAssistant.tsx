import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { lazy, Suspense, useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const AssistantMessageContent = lazy(() => import("./AssistantMessageContent"));

function errorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "object" && error.data !== null &&
    "message" in error.data && typeof error.data.message === "string") return error.data.message;
  return "The travel assistant is temporarily unavailable. Please try again.";
}

export function TripAssistant({ tripId }: { tripId?: Id<"trips"> }) {
  const session = useQuery(api.tripAssistant.session, tripId ? { tripId } : "skip");
  const messageQuery = usePaginatedQuery(api.tripAssistant.messages,
    tripId && session ? { tripId, threadId: session.threadId } : "skip", { initialNumItems: 30 });
  const send = useAction(api.tripAssistant.send);
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    const message = prompt.trim();
    if (!tripId || !message || pending) return;
    setPending(true); setError("");
    try {
      await send({ tripId, prompt: message, requestId: crypto.randomUUID() });
      setPrompt("");
    } catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }

  const messages = [...messageQuery.results].reverse().filter(item =>
    (item.role === "user" || item.role === "assistant") && item.text);
  const thinking = pending || session?.status === "pending";
  return <section className="trip-assistant" aria-labelledby="trip-assistant-title">
    <div className="trip-assistant-heading">
      <div><p className="eyebrow">Persistent trip conversation</p><h3 id="trip-assistant-title">Ask Trip-Weaver</h3></div>
      <span className="assistant-model">Free AI preview</span>
    </div>
    <div className="assistant-suggestions" aria-label="Suggested questions">
      {["Help me plan day two", "What should I prioritize?", "Review this trip for gaps"].map(suggestion =>
        <button type="button" className="secondary-button" key={suggestion} disabled={thinking}
          onClick={() => setPrompt(suggestion)}>{suggestion}</button>)}
    </div>
    <div className="assistant-messages" aria-live="polite">
      {messageQuery.status === "LoadingFirstPage" && session && <p>Loading conversation…</p>}
      {!messages.length && !thinking && <p className="assistant-empty">Your conversation will stay with this trip.</p>}
      {messages.map(item => <article className={`assistant-message is-${item.role}`} key={item.id}>
        <strong>{item.role === "user" ? "You" : "Trip-Weaver"}</strong>
        <Suspense fallback={<p className="assistant-message-loading">Formatting response…</p>}>
          <AssistantMessageContent text={item.text} />
        </Suspense>
      </article>)}
      {thinking && <p className="assistant-thinking" role="status">Trip-Weaver is thinking…</p>}
    </div>
    {messageQuery.status === "CanLoadMore" && <button type="button" className="text-button"
      onClick={() => messageQuery.loadMore(30)}>Load earlier messages</button>}
    {error && <p className="search-error" role="alert">{error}</p>}
    {!error && session?.status === "failed" && session.error && <p className="search-error" role="alert">{session.error}</p>}
    <div className="assistant-compose">
      <label htmlFor="assistant-prompt">Message</label>
      <textarea id="assistant-prompt" rows={3} maxLength={2000} required value={prompt}
        placeholder="Ask about your trip…" disabled={!tripId || thinking}
        onChange={(event) => setPrompt(event.target.value)} />
      <button className="primary-button" type="button" disabled={!tripId || thinking || !prompt.trim()}
        onClick={() => void submit()}>
        {thinking ? "Thinking…" : "Send message"}
      </button>
    </div>
  </section>;
}
