import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore";
import { db } from "../firebaseClient";  // <-- use shared db
import "../styles.css"; // Lexend + theme tokens

// Themed UI
const ui = {
  page: { fontFamily: "var(--font-sans), sans-serif", maxWidth: 560, margin: "0 auto", padding: 16 },
  h2: { fontSize: "clamp(20px, 4vw, 28px)", margin: "12px 0" },
  card: { background: "#fff", borderRadius: 12, padding: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.08)" },
  row: { display: "grid", gap: 8, marginTop: 8 },
  input: { padding: "12px 14px", borderRadius: 10, border: "1px solid #ddd", fontSize: 16 },
  btn: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    fontSize: 16,
    cursor: "pointer",
    minHeight: 44,
    background: "var(--color-dark-pink)",
    color: "#fff"
  },
  msgList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 12, maxHeight: "50vh", overflowY: "auto" },
  bubbleMe: {
    alignSelf: "flex-end",
    background: "var(--color-light-pink)",
    color: "#492642",
    borderRadius: 12,
    padding: "10px 12px",
    maxWidth: "80%"
  },
  bubbleOther: {
    alignSelf: "flex-start",
    background: "var(--color-dark-purple)",
    color: "#fff",
    borderRadius: 12,
    padding: "10px 12px",
    maxWidth: "80%"
  },
  meta: { fontSize: 12, color: "var(--muted)", marginTop: 4 }
};

export default function MessagingTest() {
  const [name, setName] = useState(localStorage.getItem("chat_name") || "");
  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [latency, setLatency] = useState(null);
  const listRef = useRef(null);
  const lastTitle = useRef(document.title);

  // Hidden default room (shared across sessions for now)
  const room = "room";

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const colRef = useMemo(
    () => collection(db, "rooms", room, "messages"),
    [room]
  );

  useEffect(() => {
    const q = query(colRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const t0 = performance.now();
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setMessages(docs);

      const newest = docs[docs.length - 1];
      if (newest && newest.name !== name && document.visibilityState === "hidden") {
        document.title = "• New message";
        setTimeout(() => (document.title = lastTitle.current), 1200);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            new Notification(`${newest.name || "Someone"}: ${newest.text}`);
          } catch {}
        }
      }

      const t1 = performance.now();
      setLatency(Math.max(0, Math.round(t1 - t0)));
      setTimeout(
        () => listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" }),
        10
      );
    });
    return () => unsub();
  }, [colRef, name]);

  useEffect(() => {
    if (name) localStorage.setItem("chat_name", name);
  }, [name]);

  const send = async (e) => {
    e?.preventDefault?.();
    const trimmed = text.trim();
    if (!trimmed) return;
    const sendT0 = performance.now();
    await addDoc(colRef, {
      text: trimmed,
      name: name || "Anon",
      createdAt: serverTimestamp()
    });
    setText("");
    const sendT1 = performance.now();
    setLatency(Math.round(sendT1 - sendT0));
  };

  return (
    <div style={ui.page}>
      <h2 style={ui.h2}>Message Your Buddy</h2>

      <div style={ui.card}>
        <div style={ui.row}>
          <label>
            <div>Display Name</div>
            <input
              style={ui.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </label>
        </div>

        <div ref={listRef} style={ui.msgList} aria-live="polite" aria-label="Messages">
          {messages.map((m) => {
            const mine = m.name === (name || "Anon");
            return (
              <div key={m.id} style={mine ? ui.bubbleMe : ui.bubbleOther}>
                <strong>{m.name || "Anon"}</strong>
                <div>{m.text}</div>
                <div style={ui.meta}>
                  {m.createdAt?.toDate?.().toLocaleTimeString?.() || "sending…"}
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={send} style={{ ...ui.row, marginTop: 12 }}>
          <input
            style={ui.input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a short message"
            inputMode="text"
            required
          />
          <button type="submit" style={ui.btn}>Send</button>
        </form>

        <div style={{ ...ui.meta, marginTop: 8 }}>
          <strong>Latency:</strong> {latency ?? "—"} ms (approx. send/receive/render)
        </div>
      </div>
    </div>
  );
}
