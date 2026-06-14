import { tokenizeSql } from "@/lib/sqlHighlight";

type SqlCodeProps = {
  ariaLabel?: string;
  children: string;
};

export function SqlCode({ ariaLabel, children }: SqlCodeProps) {
  return (
    <pre className="sql-pre" aria-label={ariaLabel}>
      <code className="language-sql sql-code">
        {tokenizeSql(children).map((token, index) =>
          token.type ? (
            <span className={`sql-token sql-${token.type}`} key={index}>
              {token.value}
            </span>
          ) : (
            token.value
          )
        )}
      </code>
    </pre>
  );
}
