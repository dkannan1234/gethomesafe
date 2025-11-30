import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom"; // NOTE: added useNavigate
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebaseClient";
import "../styles.css";

// Reuse similar styling to MessagingTest
const ui = {
  page: {
    fontFamily: "var(--font-sans), sans-serif",
    maxWidth: 560,
    margin: "0 auto",
    padding: 16,
  },
  h2: { fontSize: "clamp(20px, 4vw, 28px)", margin: "12px 0" },
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: 12,
    boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
  },
  row: { display: "grid", gap: 8, marginTop: 8 },
  input: {
    padding: "12px 14px",
    borderRadius: 10,
    border: "1px solid #ddd",
    fontSize: 16,
  },
  btn: {
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    fontSize: 16,
    cursor: "pointer",
    minHeight: 44,
    background: "var(--color-dark-pink)",
    color: "#fff",
  },
  msgList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 12,
    maxHeight: "50vh",
    overflowY: "auto",
  },
  // NOTE: updated colors to light blue for "me"
  bubbleMe: {
    alignSelf: "flex-end",
    background: "#bde0fe", // light blue
    color: "#123046",
    borderRadius: 12,
    padding: "10px 12px",
    maxWidth: "80%",
  },
  // NOTE: updated colors to light grey for partner
  bubbleOther: {
    alignSelf: "flex-start",
    background: "#f1f3f5", // light grey
    color: "#222",
    borderRadius: 12,
    padding: "10px 12px",
    maxWidth: "80%",
  },
  meta: { fontSize: 12, color: "var(--muted)", marginTop: 4 },
};

export default function MessagingScreen() {
  const { tripId } = useParams();
  const location = useLocation();
  const navigate = useNavigate(); // NOTE: added navigate for "back to trip view"

  const state = location.state || {};

  // who am I / who is the other user?
  const myUserId = state.myUserId || localStorage.getItem("ghs_user_id") || null;
  const otherUserId = state.otherUserId || null;

  const myName =
    state.myName || localStorage.getItem("ghs_name") || myUserId || "You";
  const otherName = state.otherName || "Your match";

  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const [latency, setLatency] = useState(null);
  const listRef = useRef(null);
  const lastTitle = useRef(document.title);

  // Each trip gets its own room; include both user IDs so it’s unique to this pair
  const roomId = useMemo(() => {
    if (state.roomId) return state.roomId;
    if (myUserId && otherUserId) {
      const pairKey = [myUserId, otherUserId].sort().join("__");
      return `trip_${tripId}_${pairKey}`;
    }
    return `trip_${tripId}`;
  }, [tripId, myUserId, otherUserId, state.roomId]);

  const colRef = useMemo(
    () => collection(db, "rooms", roomId, "messages"),
    [roomId]
  );

  useEffect(() => {
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // subscribe to messages for this room
  useEffect(() => {
    const q = query(colRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const t0 = performance.now();
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setMessages(docs);

      const newest = docs[docs.length - 1];
      if (
        newest &&
        newest.userId !== myUserId &&
        document.visibilityState === "hidden"
      ) {
        document.title = "• New message";
        setTimeout(() => (document.title = lastTitle.current), 1200);
        if (
          typeof Notification !== "undefined" &&
          Notification.permission === "granted"
        ) {
          try {
            new Notification(`${newest.name || "Someone"}: ${newest.text}`);
          } catch {}
        }
      }

      const t1 = performance.now();
      setLatency(Math.max(0, Math.round(t1 - t0)));
      setTimeout(
        () =>
          listRef.current?.lastElementChild?.scrollIntoView({
            behavior: "smooth",
          }),
        10
      );
    });
    return () => unsub();
  }, [colRef, myUserId]);

  const send = async (e) => {
    e?.preventDefault?.();
    const trimmed = text.trim();
    if (!trimmed) return;
    const sendT0 = performance.now();
    await addDoc(colRef, {
      text: trimmed,
      name: myName,
      userId: myUserId,
      tripId,
      otherUserId,
      createdAt: serverTimestamp(),
    });
    setText("");
    const sendT1 = performance.now();
    setLatency(Math.round(sendT1 - sendT0));
  };

  return (
    <div className="screen messaging-screen">
      <div style={ui.page}>
        <header className="screen-header messaging-header">
          <button
            className="btn btn--secondary"
            type="button"
            onClick={() => navigate(-1)} // NOTE: navigate back to trip view
          >
            ← Back to trip details
          </button>

          <div className="messaging-title-block">
            <h1 className="screen-title">Messages</h1>
            <p className="screen-subtitle"
            style={{ textAlign: "left", width: "100%", marginTop: 4 }}>
              Trip: {tripId ? tripId.slice(0, 8) : "Unknown"}
            </p>
          </div>
        </header>

        <div style={ui.card}>
          {/* fixed identity – user cannot choose their name */}
          <div style={ui.row}>
            <div>
              <div style={{ fontSize: 13, color: "var(--muted)" }}>
                You&apos;re chatting as
              </div>
              <div style={{ fontWeight: 600 }}>{myName}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                With: <strong>{otherName}</strong>
              </div>
            </div>
          </div>

          <div
            ref={listRef}
            style={ui.msgList}
            aria-live="polite"
            aria-label="Messages"
          >
            {messages.map((m) => {
              const mine = m.userId === myUserId;
              return (
                <div key={m.id} style={mine ? ui.bubbleMe : ui.bubbleOther}>
                  <strong>{m.name || (mine ? myName : otherName)}</strong>
                  <div>{m.text}</div>
                  <div style={ui.meta}>
                    {m.createdAt?.toDate?.().toLocaleTimeString?.() ||
                      "sending…"}
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
            <button type="submit" style={ui.btn}>
              Send
            </button>
          </form>

          <div style={{ ...ui.meta, marginTop: 8 }}>
            <strong>Latency:</strong> {latency ?? "—"} ms
          </div>
        </div>
      </div>
    </div>
  );
}