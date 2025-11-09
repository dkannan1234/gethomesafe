import { Routes, Route, Link } from "react-router-dom";
import HelloWorld from "./screens/HelloWorld.jsx"; import HelloStyles from "./screens/HelloStyles.jsx";
import LocationTest from "./screens/LocationTest.jsx";
import MessagingTest from "./screens/MessagingTest.jsx";
import MappingTest from "./screens/MappingTest.jsx";

export default function App() {
  return (
    <div style={{ padding: 40, fontFamily: "Helvetica, Arial, sans-serif" }}>
      <h1>GetHomeSafe Prototypes</h1>
      <nav>
        <Link to="/hello-world">Hello World</Link>
        <Link to="/hello-styles">Hello Styles</Link>
        <Link to="/messaging-test">Messaging Test</Link>
        <Link to="/location-test">Location Test</Link>
        <Link to="/mapping-test">Mapping Test</Link>
      </nav>

      <Routes>
        <Route path="/hello-world" element={<HelloWorld />} />
        <Route path="/hello-styles" element={<HelloStyles />} />
        <Route path="/location-test" element={<LocationTest />} />
         <Route path="/messaging-test" element={<MessagingTest />} />
        <Route path="/mapping-test" element={<MappingTest />} />
      </Routes>
    </div>
  );
}