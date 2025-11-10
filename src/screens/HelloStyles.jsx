import React from "react";
import "../styles.css"; 

export default function HelloStyles() {
  const colors = [
    { name: "Light Pink", code: "#f5d7f2" },
    { name: "Dark Pink", code: "#b83990ff" },
    { name: "Dark Purple", code: "#492642ff" },
  ];

  return (
    <div className="hello-page">
      <h1 className="hello-title">Hello Styles Aaa</h1>
      <p className="hello-description">
        This demo shows our design style: Lexend font and comforting pastel colors.
      </p>

      <div className="palette">
        {colors.map((c) => (
          <div key={c.name}>
            <div
              className="swatch"
              style={{ backgroundColor: c.code }}
            ></div>
            <div className="swatch-caption">{c.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
