

## Changes to `src/app/page.tsx`

### 1. Simplify spiral pricing (lines 28-30)
- Remove `SPIRAL_PLASTIC_OVER_200` and `SPIRAL_PAGE_THRESHOLD` — all spirals cost 3 RON flat.
- Rename `SPIRAL_PLASTIC_UP_TO_200` → `SPIRAL_PRICE` = 3.

### 2. Update types (lines 93-95)
- `SpiralType`: remove `"plastic"`, replace with `"spirala"` → `"none" | "spirala" | "perforare2" | "capsare"`
- `SpiralColorOption`: only `"negru" | "alb"` (remove `"albastru"` and `"rosu"`)
- `CoverColor`: split into two types:
  - `CoverFrontColor = "transparent"` (fixed, no choice needed)
  - `CoverBackColor = "negru" | "alb" | "albastru_inchis" | "galben" | "rosu" | "verde"` with default `"negru"`

### 3. Update defaults (line 175-180)
- `spiralColor: "negru"` (stays same)
- `coverFrontColor`: remove from options (always "transparent")
- `coverBackColor: "negru"` as default

### 4. Update spiral color options (lines 476-485)
- Only negru and alb.

### 5. Update spiral options (lines 494-498)
- Change `"plastic"` → `"spirala"`, label "Spiralare", description always "3 lei".

### 6. Update cover colors (lines 457-474)
- **Remove front cover UI entirely** — always transparent, no user choice needed.
- **Back cover options**: negru (default), alb, albastru închis, galben, roșu, verde.

### 7. Update spiral price calculation (lines 440-453)
- Simplify: if `spiralType === "spirala"`, add `SPIRAL_PRICE` (3 RON). No threshold check.

### 8. Update all references
- Replace `"plastic"` with `"spirala"` everywhere (checkout metadata, order body, config_details, summary text).
- Remove front cover selection UI, show "Transparent (standard)" as static text.

