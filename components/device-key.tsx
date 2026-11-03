"use client";
import { useState } from "react";
export function KeyNotice({ value, clear }: { value: string; clear: () => void }) {
    const [visible, setVisible] = useState(false); const [copied, setCopied] = useState(false);
    return <section className="key-notice" aria-label="New device key"><h2>Save this device key now</h2><p>It will not be shown again. This key only permits usage reporting. Enter it into the setup script’s hidden prompt.</p><label>Device tracker key<input readOnly type={visible ? 'text' : 'password'} value={value} /></label><div className="actions"><button onClick={() => setVisible(!visible)}>{visible ? 'Hide key' : 'Show key'}</button><button onClick={() => void navigator.clipboard.writeText(value).then(() => setCopied(true)).catch(() => setVisible(true))}>{copied ? 'Copied' : 'Copy key'}</button><button onClick={clear}>I saved the key</button></div></section>;
}
