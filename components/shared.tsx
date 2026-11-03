import type { ReactNode } from "react";
export function Heading({ title, description, children }: { title: string; description: string; children?: ReactNode }) { return <header className="page-heading"><div><h1>{title}</h1><p>{description}</p></div><div className="actions">{children}</div></header>; }
export function ErrorBox({ error }: { error: string }) { return <div className="error" role="alert">{error}</div>; }
