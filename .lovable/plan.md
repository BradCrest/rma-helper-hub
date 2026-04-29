## Problem

Upload fails with `Invalid key: rma-replies/.../截圖 2026-04-10 凌晨12.13.44.png`.

Supabase Storage object keys only allow a limited character set (ASCII letters, digits, and a few symbols like `-`, `_`, `.`, `/`). Chinese characters and spaces in the filename break the key.

In `RmaReplyTab.tsx` line 228, the upload path is built directly from `file.name`:

```ts
const path = `rma-replies/${selected.id}/${crypto.randomUUID()}-${file.name}`;
```

When `file.name` contains Chinese / spaces / other unsafe characters, the storage SDK rejects it.

## Fix

Sanitize the filename used in the storage key, but **keep the original filename for display and for the email download link** (so customers still see `截圖 2026-04-10 ….png` when they download).

### Changes

**`src/components/logistics/RmaReplyTab.tsx`**

1. Add a small helper:
   ```ts
   const sanitizeForKey = (name: string) => {
     const dot = name.lastIndexOf('.');
     const base = dot > 0 ? name.slice(0, dot) : name;
     const ext  = dot > 0 ? name.slice(dot) : '';
     const safeBase = base
       .replace(/[^\w.-]+/g, '_')   // non-ASCII / spaces / 中文 → _
       .replace(/_+/g, '_')
       .replace(/^_|_$/g, '')
       || 'file';
     const safeExt = ext.replace(/[^\w.]+/g, '');
     return `${safeBase}${safeExt}`.slice(0, 120);
   };
   ```

2. Use it when building the storage path:
   ```ts
   const safeName = sanitizeForKey(file.name);
   const path = `rma-replies/${selected.id}/${crypto.randomUUID()}-${safeName}`;
   ```

3. Keep `name: file.name` (original) in the attachment metadata stored in state and sent to the edge function — the edge function already passes this to `createSignedUrl(..., { download: a.name })`, so the customer downloads with the original Chinese filename intact.

### Why this works

- Storage key is now ASCII-safe → upload succeeds.
- The UUID prefix still guarantees uniqueness.
- Customer-facing filename (in email and on download) is untouched because it lives in the JSON metadata, not the storage key.
- No DB / bucket / edge function changes needed.

### Out of scope

- No migration.
- No changes to the email template or `send-rma-reply` edge function.
