import fs from "node:fs";
import path from "node:path";

type ScreenshotProps = {
  /** Path under public/, e.g. "shots/operator-lens.png". */
  src: string;
  /** What the screenshot shows (also the placeholder description + alt text). */
  alt: string;
  caption?: string;
  /** Full-bleed within the band. */
  wide?: boolean;
};

/**
 * A Lens-screenshot slot. Renders the image once `public/<src>` exists; until
 * then it shows an intentional, captioned placeholder telling you exactly which
 * file to drop in — so the page looks finished now and upgrades automatically
 * when you add the PNG.
 */
export function Screenshot({ src, alt, caption, wide }: ScreenshotProps) {
  const exists = fs.existsSync(path.join(process.cwd(), "public", src));
  return (
    <figure className={`shot${wide ? " shot-wide" : ""}${exists ? "" : " shot-empty"}`}>
      {exists ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/${src}`} alt={alt} loading="lazy" />
      ) : (
        <div className="shot-placeholder" role="img" aria-label={alt}>
          <span className="shot-tag">Lens screenshot</span>
          <span className="shot-desc">{alt}</span>
          <code className="shot-path">public/{src}</code>
        </div>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
