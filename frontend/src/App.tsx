import { useState } from "react";
import EventsPage from "./EventsPage";
import LoginPage from "./LoginPage";

function hasSession() {
  return !!localStorage.getItem("emw_session");
}

export default function App() {
  const [authed, setAuthed] = useState(hasSession());

  if (!authed) return <LoginPage onDone={() => setAuthed(true)} />;
  return <EventsPage />;
}
