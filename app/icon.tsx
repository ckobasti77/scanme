import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0c0a",
          border: "3px solid #c6ff4a",
          color: "#c6ff4a",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        S
      </div>
    ),
    size,
  );
}
