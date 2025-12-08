import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
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

export default function MessagingScreen() {
  const { tripId } = useParams(); // can still be in the URL, but we won't use it for the room key
  const location = useLocation();
  const navigate = useNavigate();

  const state = location.state || {};

  const myUserId =
    state.myUserId || localStorage.getItem("ghs_user_id") || null;
  const otherUserId = state.otherUserId || null;

  const myName =
    state.myName || localStorage.getItem("ghs_name") || myUserId || "You";
  const otherName = state.otherName || "Your match";

  const [text, setText] = useState("");
  const [messages, setMessages] = useState([]);
  const listRef = useRef(null);

  // ROOM ID: based ONLY on the user pair, not the trip
  const roomId = useMemo(() => {
    if (state.roomId) return state.roomId;
    if (myUserId && otherUserId) {
      const pairKey = [String(myUserId), String(otherUserId)]
        .sort()
        .join("__");
      return `users_${pairKey}`;
    }
    return null;
  }, [myUserId, otherUserId, state.roomId]);

  const colRef = useMemo(() => {
    if (!roomId) return null;
    return collection(db, "rooms", roomId, "messages");
  }, [roomId]);

  // If someone somehow navigates here without IDs, bounce them back
  useEffect(() => {
    if (!myUserId || !otherUserId) {
      console.warn("[MessagingScreen] Missing user IDs, going back");
      navigate(-1);
    }
  }, [myUserId, otherUserId, navigate]);

  // Subscribe to messages in this user-pair room
  useEffect(() => {
    if (!colRef) return;

    const q = query(colRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const docs = [];
      snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
      setMessages(docs);

      // Scroll to bottom
      setTimeout(
        () =>
          listRef.current?.lastElementChild?.scrollIntoView({
            behavior: "smooth",
          }),
        20
      );
    });

    return () => unsub();
  }, [colRef]);

  const send = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || !colRef) return;

    await addDoc(colRef, {
      text: trimmed,
      name: myName,
      userId: myUserId,
      otherUserId,
      tripId,
      createdAt: serverTimestamp(),
    });

    setText("");
  };

  if (!myUserId || !otherUserId || !roomId) {
    // avoid rendering weirdly before we have IDs
    return null;
  }

  return (
    <div className="screen messaging-screen">
      <div className="messaging-container">
        {/* HEADER */}
        <header className="messaging-header">
          <button
            className="messaging-back-btn"
            type="button"
            onClick={() => navigate(-1)}
          >
            ← Back to match
          </button>

          <div>
            <h1 className="messaging-title">Chat with {otherName}</h1>
            <p className="messaging-subtitle">
              Agree where to meet or stay on the phone while you walk.
            </p>
          </div>
        </header>

        {/* CARD */}
        <div className="messaging-card">
          <div className="messaging-meta">
            You’re chatting as <strong>{myName}</strong> with{" "}
            <strong>{otherName}</strong>
          </div>

          <div ref={listRef} className="messaging-list">
            {messages.map((m) => {
              const mine = m.userId === myUserId;
              return (
                <div
                  key={m.id}
                  className={
                    mine
                      ? "message-bubble message-bubble--me"
                      : "message-bubble message-bubble--other"
                  }
                >
                  <div className="message-name">
                    {m.name || (mine ? myName : otherName)}
                  </div>
                  <div>{m.text}</div>
                  <div className="message-time">
                    {m.createdAt?.toDate?.().toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    }) || "…"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* INPUT */}
          <form className="messaging-input-row" onSubmit={send}>
            <input
              className="messaging-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Say hi and let them know your ETA…"
            />
            <button
              type="submit"
              className="btn btn--primary messaging-send-btn"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
