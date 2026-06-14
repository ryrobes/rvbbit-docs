import { RabbitMark } from "@/components/RabbitMark";

export function RabbitHero() {
  return (
    <div className="rabbit-hero-art" aria-hidden="true">
      <div className="rabbit-field">
        <span />
        <span />
        <span />
        <span />
      </div>
      <RabbitMark
        className="rabbit-hero-mark"
        title=""
      />
      <div className="rabbit-shadow-mark">
        <RabbitMark className="rabbit-hero-echo" title="" variant="filled" />
      </div>
    </div>
  );
}
