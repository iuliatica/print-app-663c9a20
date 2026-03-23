export default function PoliticaConfidentialitatePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-6 text-sm text-slate-800">
      <h1 className="text-2xl font-bold text-slate-900 mb-4">Politica de confidențialitate</h1>

      <p>
        Această politică descrie modul în care <strong>[Nume Firmă] SRL</strong>, CUI{" "}
        <strong>[CUI]</strong> (denumită în continuare „Operatorul”) prelucrează datele cu caracter
        personal ale utilizatorilor platformei de printare online.
      </p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">1. Categorii de date prelucrate</h2>
        <p>Putem prelucra următoarele categorii de date:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>date de identificare: nume și prenume;</li>
          <li>date de contact: email, număr de telefon, adresă de livrare;</li>
          <li>date tehnice: adresă IP, tip browser, informații despre dispozitiv;</li>
          <li>
            conținutul fișierelor încărcate (documente PDF) – folosit exclusiv pentru
            prestarea serviciului de printare;
          </li>
          <li>informații privind plată și statusul comenzilor (fără date complete de card).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">2. Scopurile prelucrării</h2>
        <p>Prelucrăm datele dvs. pentru următoarele scopuri:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>preluarea, procesarea și livrarea comenzilor de printare;</li>
          <li>emiterea documentelor fiscale și evidență contabilă;</li>
          <li>comunicare cu dvs. privind statusul comenzilor sau eventuale probleme;</li>
          <li>îndeplinirea obligațiilor legale (protecția consumatorului, arhivare contabilă);</li>
          <li>analiză internă și îmbunătățirea serviciilor (statistici agregate și anonimizate).</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">3. Temeiuri legale</h2>
        <p>
          Prelucrarea se bazează, după caz, pe executarea contractului (art. 6 alin. 1 lit. b GDPR),
          obligație legală (art. 6 alin. 1 lit. c), interes legitim (art. 6 alin. 1 lit. f) și, în
          anumite situații, consimțământ (art. 6 alin. 1 lit. a).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">4. Stocarea și perioada de păstrare</h2>
        <p>
          Fișierele PDF încărcate de utilizatori sunt <strong>șterse automat după 30 de zile</strong> de la
          plasarea comenzii. După ștergere, doar metadatele comenzii (numele fișierelor, numărul de pagini,
          opțiunile de printare) rămân stocate pentru evidență internă. Documentele fiscale (facturi) sunt
          păstrate conform termenelor prevăzute de legislația financiar-contabilă în vigoare.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">5. Destinatarii datelor</h2>
        <p>Putem transmite datele către următoarele categorii de destinatari:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>furnizori de servicii IT și găzduire (de ex. platforme cloud, servicii de email);</li>
          <li>procesatori de plăți (de ex. Stripe) – pentru plățile online;</li>
          <li>firme de curierat – pentru livrarea coletelor;</li>
          <li>autorități publice, atunci când există o obligație legală.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">6. Drepturile dumneavoastră</h2>
        <p>
          În calitate de persoană vizată, beneficiați de dreptul de acces, rectificare, ștergere
          (în limitele legii), restricționare, opoziție și portabilitate a datelor, precum și dreptul
          de a depune o plângere la ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării
          Datelor cu Caracter Personal).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">7. Securitatea datelor</h2>
        <p>
          Implementăm măsuri tehnice și organizatorice adecvate pentru a proteja datele împotriva
          accesului neautorizat, pierderii sau distrugerii. Totuși, niciun sistem nu poate garanta
          securitate absolută.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">8. Contact</h2>
        <p>
          Pentru orice întrebări legate de prelucrarea datelor cu caracter personal, ne puteți
          contacta la adresa de email indicată în pagina de contact sau în footer-ul site-ului.
        </p>
      </section>
    </main>
  );
}

