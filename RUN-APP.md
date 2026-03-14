# Cum pornești aplicația

## Problema
PowerShell dă eroarea: *"running scripts is disabled on this system"*.

## Soluția 1 – Permite scripturile (o singură dată)

1. Deschide **PowerShell ca Administrator** (Start → caută "PowerShell" → click dreapta → "Run as administrator").
2. Rulează:
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
3. La întrebare, tastează `Y` și Enter.
4. Închide PowerShell-ul cu drepturi de admin.
5. În Cursor, deschide Terminal și rulează:
   ```powershell
   cd c:\Users\Iuli\xerox-app
   npm run dev
   ```
6. Deschide în browser adresa afișată (ex: http://localhost:3000).

## Soluția 2 – Folosește Command Prompt (fără să schimbi PowerShell)

1. În Cursor: **Terminal** → **New Terminal** → din meniu alege **Command Prompt** (sau **cmd**), nu PowerShell.
2. Rulează:
   ```cmd
   cd c:\Users\Iuli\xerox-app
   npm run dev
   ```
3. Deschide în browser adresa afișată (ex: http://localhost:3000).
