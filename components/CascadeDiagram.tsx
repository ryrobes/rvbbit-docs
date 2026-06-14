import {
  Braces,
  CheckCircle2,
  Database,
  GitBranch,
  Repeat2,
  ScrollText,
  Sparkles
} from "lucide-react";

const stages = [
  {
    className: "sql-call",
    icon: Database,
    label: "SQL call",
    detail: "SELECT rvbbit.review_risk(row)"
  },
  {
    className: "gate",
    icon: CheckCircle2,
    label: "Gate",
    detail: "pre-checks and policy"
  },
  {
    className: "takes",
    icon: GitBranch,
    label: "Takes",
    detail: "parallel model attempts"
  },
  {
    className: "retry",
    icon: Repeat2,
    label: "Repair",
    detail: "retry invalid outputs"
  },
  {
    className: "reduce",
    icon: Braces,
    label: "Reduce",
    detail: "typed value"
  },
  {
    className: "receipt",
    icon: ScrollText,
    label: "Receipt",
    detail: "cost and trace"
  }
];

export function CascadeDiagram() {
  return (
    <div className="cascade-diagram" aria-label="Cascade operator workflow">
      <svg className="cascade-lines" viewBox="0 0 960 430" aria-hidden="true">
        <path
          className="cascade-line main"
          d="M90 218 C190 218 198 100 312 100 C418 100 420 218 520 218 C636 218 644 330 768 330 C842 330 866 258 900 258"
        />
        <path
          className="cascade-line branch one"
          d="M332 100 C384 32 520 36 572 106"
        />
        <path
          className="cascade-line branch two"
          d="M332 100 C384 170 520 166 572 106"
        />
        <path
          className="cascade-line loop"
          d="M628 218 C700 150 808 164 820 238 C834 322 716 352 668 292"
        />
        <circle className="cascade-pulse mint" r="6">
          <animateMotion dur="8s" repeatCount="indefinite">
            <mpath href="#cascade-motion-main" />
          </animateMotion>
        </circle>
        <path
          id="cascade-motion-main"
          d="M90 218 C190 218 198 100 312 100 C418 100 420 218 520 218 C636 218 644 330 768 330 C842 330 866 258 900 258"
          fill="none"
        />
        <Sparkles className="cascade-spark" x="734" y="76" size={24} />
      </svg>
      {stages.map((stage) => {
        const Icon = stage.icon;
        return (
          <div className={`cascade-node ${stage.className}`} key={stage.label}>
            <Icon aria-hidden="true" size={18} />
            <strong>{stage.label}</strong>
            <span>{stage.detail}</span>
          </div>
        );
      })}
    </div>
  );
}

