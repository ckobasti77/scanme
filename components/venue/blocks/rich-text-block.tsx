// richText — server-only. The content is PLAIN TEXT from the block model
// (never HTML — nothing to sanitize): blank lines split paragraphs, single
// newlines break lines. Empty content renders nothing.

import { Fragment } from "react";
import type { RichTextProps } from "@/lib/venue-blocks";
import styles from "../venue-template.module.css";

export function RichTextBlock({ props }: { props: RichTextProps }) {
  const paragraphs = props.content
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return null;

  return (
    <div className={styles.richText}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>
          {paragraph.split("\n").map((line, lineIndex, lines) => (
            <Fragment key={lineIndex}>
              {line}
              {lineIndex < lines.length - 1 ? <br /> : null}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}
