"use client";


import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  FileUp,
  FileText,
  Printer,
  CreditCard,
  Loader2,
  X,
  BookOpen,
  BookMarked,
  Circle,
  Paperclip,
  Settings2,
  ChevronUp,
  ChevronDown,
  Link2,
  Unlink2,
  Plus,
  ChevronRight,
  HelpCircle,
  Upload,
  Check,
  Truck,
  Shield,
  
  Star,
  Lock,
  Phone,
  Info,
  Palette,
} from "lucide-react";
import { getPdfPageCount, analyzePdfColors, type PdfColorAnalysis } from "@/lib/pdf-utils";


// ─── Constants ───────────────────────────────────────────────────────────────
const PRICE_BW_ONE_SIDE = 0.2;
const PRICE_BW_DUPLEX = 0.35;
const PRICE_COLOR_ONE_SIDE = 0.7;
const PRICE_COLOR_DUPLEX = 1.2;
const SPIRAL_PRICE = 5;
const SHIPPING_COST_LEI = 15;
const MIN_ORDER_LEI = 30;
const MAX_CAPSARE_SHEETS = 220;
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 20;
const FILE_SIZE_ERROR_MSG = "Fișier prea mare (max 50 MB).";
const LS_KEY_SHIPPING = "printica_shipping";
const LS_KEY_PAYMENT = "printica_payment";
const LS_KEY_DELIVERY = "printica_delivery";
const LS_KEY_GROUP_OPTS = "printica_group_opts";
const LS_KEY_FILE_OPTS = "printica_file_opts";
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;
const MIN_ADDRESS_LENGTH = 10;
const MAX_ADDRESS_LENGTH = 300;
const ROMANIAN_PHONE_DIGITS = /^(0?7[0-9]{8}|407[0-9]{8})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_NAME_REGEX = /^[a-zA-ZăâîșțĂÂÎȘȚ\s\-']+$/;
const PICKUP_ADDRESS = "Alba Iulia, localitatea Barabant, strada Mureșului";

type DeliveryMethod = "curier" | "ridicare";

// ─── Types ───────────────────────────────────────────────────────────────────
type ShippingForm = { name: string; phone: string; email: string; address: string };
type ShippingErrors = Partial<Record<keyof ShippingForm, string>>;

function validateShipping(form: ShippingForm, deliveryMethod: DeliveryMethod): ShippingErrors {
  const err: ShippingErrors = {};
  const name = form.name.trim();
  const phone = form.phone.trim().replace(/\s/g, "");
  const email = form.email.trim().toLowerCase();
  const address = form.address.trim();
  if (!name) err.name = "Numele este obligatoriu.";
  else if (name.length < MIN_NAME_LENGTH) err.name = `Numele trebuie să aibă cel puțin ${MIN_NAME_LENGTH} caractere.`;
  else if (name.length > MAX_NAME_LENGTH) err.name = `Numele nu poate depăși ${MAX_NAME_LENGTH} caractere.`;
  else if (!VALID_NAME_REGEX.test(name)) err.name = "Numele poate conține doar litere, spații, cratimă și apostrof.";
  const digitsOnly = phone.replace(/\D/g, "");
  if (!phone) err.phone = "Numărul de telefon este obligatoriu.";
  else if (!ROMANIAN_PHONE_DIGITS.test(digitsOnly)) err.phone = "Introdu un număr de telefon valid (ex: 0712345678).";
  if (!email) err.email = "Emailul este obligatoriu.";
  else if (!EMAIL_REGEX.test(email)) err.email = "Introdu o adresă de email validă.";
  if (deliveryMethod === "curier") {
    if (!address) err.address = "Adresa de livrare este obligatorie.";
    else if (address.length < MIN_ADDRESS_LENGTH) err.address = `Adresa trebuie să aibă cel puțin ${MIN_ADDRESS_LENGTH} caractere.`;
    else if (address.length > MAX_ADDRESS_LENGTH) err.address = `Adresa nu poate depăși ${MAX_ADDRESS_LENGTH} caractere.`;
  }
  return err;
}

type PrintMode = "color" | "bw";
type SpiralType = "none" | "spirala" | "perforare2" | "capsare";
type SpiralColorOption = "negru";
type CoverBackColor = "negru" | "alb" | "albastru_inchis" | "galben" | "rosu" | "verde";

type OrderSuccessGroup = {
  files: { name: string; pages: number | null; printMode: string; duplex: boolean; copies: number }[];
  spiralType: SpiralType;
  spiralColor: SpiralColorOption;
  coverBackColor: CoverBackColor;
};

type OrderSuccessDetails = {
  paymentMethod: "stripe" | "ramburs";
  deliveryMethod: DeliveryMethod;
  groups: OrderSuccessGroup[];
  totalPages: number;
  totalPrice: number;
  totalWithShipping: number;
};

interface UploadedFile {
  id: string;
  file: File;
  name: string;
  pages: number | null;
  error?: string;
  printMode: PrintMode;
  duplex: boolean;
  copies: number;
  previewUrl: string;
  previewOpen?: boolean;
  groupWithPrevious: boolean;
  colorAnalysis?: PdfColorAnalysis;
}

const DEFAULT_PRINT_OPTIONS = {
  printMode: "bw" as PrintMode,
  duplex: false,
  copies: 1,
};

function getBindingGroups(files: UploadedFile[]): { groupIndex: number; filesInGroup: UploadedFile[] }[] {
  if (files.length === 0) return [];
  const result: { groupIndex: number; filesInGroup: UploadedFile[] }[] = [];
  let current: UploadedFile[] = [files[0]];
  for (let i = 1; i < files.length; i++) {
    if (files[i].groupWithPrevious === true) {
      current.push(files[i]);
    } else {
      result.push({ groupIndex: result.length, filesInGroup: current });
      current = [files[i]];
    }
  }
  result.push({ groupIndex: result.length, filesInGroup: current });
  return result;
}

/** Calculează prețul unui singur fișier */
function calculateFilePrice(f: UploadedFile): number {
  if (f.pages == null) return 0;
  const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
  const duplex = f.duplex ?? DEFAULT_PRINT_OPTIONS.duplex;
  const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
  // For single-page documents, duplex is identical to simplex (1 page = 1 sheet regardless)
  const effectiveDuplex = duplex && f.pages > 1;

  if (mode === "bw") {
    if (effectiveDuplex) {
      const totalPages = f.pages * copies;
      // If odd number of pages, last page of each copy is simplex
      const fullSheets = Math.floor(f.pages / 2) * copies;
      const oddLastPages = (f.pages % 2 !== 0) ? copies : 0;
      return fullSheets * PRICE_BW_DUPLEX + oddLastPages * PRICE_BW_ONE_SIDE;
    }
    return f.pages * copies * PRICE_BW_ONE_SIDE;
  }

  if (f.colorAnalysis) {
    const colorPages = f.colorAnalysis.colorPages;
    const bwPages = f.colorAnalysis.bwPages;
    if (effectiveDuplex) {
      // For duplex with color analysis, if total pages odd, last page is simplex
      // We approximate: pair pages into sheets, last odd page at simplex rate
      const totalPagesPerCopy = f.pages;
      const fullSheets = Math.floor(totalPagesPerCopy / 2);
      const hasOddPage = totalPagesPerCopy % 2 !== 0;
      // Proportional split for duplex sheets
      const colorRatio = colorPages / totalPagesPerCopy;
      const colorSheets = Math.round(fullSheets * colorRatio) * copies;
      const bwSheets = (fullSheets - Math.round(fullSheets * colorRatio)) * copies;
      let price = colorSheets * PRICE_COLOR_DUPLEX + bwSheets * PRICE_BW_DUPLEX;
      if (hasOddPage) {
        // Last page: determine if it's color or bw based on ratio
        const lastPageColor = colorRatio > 0.5;
        price += copies * (lastPageColor ? PRICE_COLOR_ONE_SIDE : PRICE_BW_ONE_SIDE);
      }
      return price;
    }
    return colorPages * copies * PRICE_COLOR_ONE_SIDE + bwPages * copies * PRICE_BW_ONE_SIDE;
  }

  if (effectiveDuplex) {
    const fullSheets = Math.floor(f.pages / 2) * copies;
    const oddLastPages = (f.pages % 2 !== 0) ? copies : 0;
    return fullSheets * PRICE_COLOR_DUPLEX + oddLastPages * PRICE_COLOR_ONE_SIDE;
  }
  return f.pages * copies * PRICE_COLOR_ONE_SIDE;
}

// ─── Progress Stepper Component ──────────────────────────────────────────────
function ProgressStepper({ currentStep }: { currentStep: number }) {
  const steps = [
    { label: "Încarcă", icon: Upload },
    { label: "Configurează", icon: Settings2 },
    { label: "Plătește", icon: CreditCard },
  ];
  return (
    <div className="flex items-center justify-center gap-0 mb-4">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = i === currentStep;
        const isDone = i < currentStep;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-300 ${
                  isDone
                    ? "bg-green-500 text-white shadow-md shadow-green-500/20"
                    : isActive
                    ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 scale-110"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={`text-xs font-semibold transition-colors ${
                  isDone ? "text-green-600" : isActive ? "text-cyan-700" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className="mx-2 sm:mx-4 mb-5">
                <div
                  className={`h-0.5 w-8 sm:w-16 rounded-full transition-colors duration-300 ${
                    i < currentStep ? "bg-green-400" : "bg-slate-200"
                  }`}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── FAQ Component ────────────────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const items = [
    { q: "Ce format de fișier acceptați?", a: "Acceptăm doar fișiere PDF, cu o dimensiune maximă de 50 MB per fișier. Poți încărca până la 20 de fișiere simultan." },
    { q: "Cum funcționează spiralarea?", a: "Spiralarea leagă documentele într-un volum unic cu spirală neagră de plastic. Poți alege culoarea copertei spate. Coperta față este întotdeauna transparentă." },
    { q: "Pot lega mai multe fișiere într-o singură spirală?", a: "Da! Folosește butonul 'Leagă împreună' dintre două fișiere din listă pentru a le combina într-un singur volum spiralat." },
    { q: "Cum se calculează prețul?", a: "Prețul depinde de tipul printării (alb-negru sau color), față-verso, numărul de copii și opțiunea de spiralare. Când alegi opțiunea Color, sistemul analizează automat fiecare pagină din PDF și identifică paginile color și cele alb-negru — plătești preț de color doar pentru paginile efectiv colorate, restul fiind taxate la preț de alb-negru. Atenție: această analiză automată nu se aplică documentelor scanate (formate din imagini), care vor fi taxate integral la preț de color." },
    { q: "Cât durează livrarea?", a: "Comenzile sunt procesate și livrate prin curier în 2-4 zile lucrătoare. Costul transportului este de 15 RON." },
    { q: "Ce metode de plată acceptați?", a: "Acceptăm plata online cu cardul (prin Stripe, 100% securizat) sau plata la livrare (ramburs)." },
  ];
  return (
    <section className="mt-10 mx-auto max-w-3xl">
      <div className="flex items-center gap-2 mb-4">
        <HelpCircle className="h-4 w-4 text-cyan-600" />
        <h2 className="text-lg font-bold text-slate-800">Întrebări frecvente</h2>
      </div>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-all duration-200">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50/80 transition-colors"
            >
              <span className="text-sm font-semibold text-slate-700">{item.q}</span>
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                  open === i ? "rotate-90" : ""
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                open === i ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <p className="px-5 pb-4 text-sm text-slate-600 leading-relaxed">{item.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Upload Progress Bar ──────────────────────────────────────────────────────
function UploadProgressBar({ isUploading, progress }: { isUploading: boolean; progress: number }) {
  if (!isUploading) return null;
  return (
    <div className="rounded-xl border border-cyan-200 bg-cyan-50/80 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />
          <span className="text-sm font-medium text-cyan-800">Se încarcă fișierele...</span>
        </div>
        <span className="text-sm font-bold text-cyan-700 tabular-nums">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 rounded-full bg-cyan-200/60 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-500 transition-all duration-300 ease-out"
          style={{ width: `${Math.round(progress)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Toast Component ─────────────────────────────────────────────────────────
function Toast({ message, type, onClose }: { message: string; type: "success" | "error" | "info"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "bg-green-50 border-green-300 text-green-800",
    error: "bg-red-50 border-red-300 text-red-800",
    info: "bg-cyan-50 border-cyan-300 text-cyan-800",
  };

  return (
    <div className={`fixed top-4 right-4 z-[100] flex items-center gap-3 rounded-xl border px-5 py-3 shadow-lg animate-[fade-in_0.3s_ease-out] ${colors[type]}`}>
      <span className="text-sm font-medium">{message}</span>
      <button type="button" onClick={onClose} className="p-1 hover:opacity-70">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── Main Page Component ─────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [previewFromCheckout, setPreviewFromCheckout] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingForm>(() => {
    if (typeof window === "undefined") return { name: "", phone: "", email: "", address: "" };
    try {
      const saved = localStorage.getItem(LS_KEY_SHIPPING);
      if (saved) return JSON.parse(saved) as ShippingForm;
    } catch { /* ignore */ }
    return { name: "", phone: "", email: "", address: "" };
  });
  const [shippingErrors, setShippingErrors] = useState<ShippingErrors>({});
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "ramburs">(() => {
    if (typeof window === "undefined") return "stripe";
    try {
      const saved = localStorage.getItem(LS_KEY_PAYMENT);
      if (saved === "ramburs") return "ramburs";
    } catch { /* ignore */ }
    return "stripe";
  });
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(() => {
    if (typeof window === "undefined") return "curier";
    try {
      const saved = localStorage.getItem(LS_KEY_DELIVERY);
      if (saved === "ridicare") return "ridicare";
    } catch { /* ignore */ }
    return "curier";
  });
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderSuccessDetails, setOrderSuccessDetails] = useState<OrderSuccessDetails | null>(null);
  const [scrollToFileId, setScrollToFileId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<{ id: string; message: string; type: "success" | "error" | "info" }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addToast = useCallback((message: string, type: "success" | "error" | "info" = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const defaultGroupOpts = {
    spiralType: "none" as SpiralType,
    spiralColor: "negru" as SpiralColorOption,
    coverBackColor: "negru" as CoverBackColor,
  };
  const [groupOptions, setGroupOptions] = useState<Record<number, typeof defaultGroupOpts>>({});
  const bindingGroups = useMemo(() => getBindingGroups(files), [files]);
  const selectedGroupIndex: number | null = useMemo(() => {
    if (!selectedFileId || files.length === 0) return null;
    const idx = bindingGroups.findIndex((g) => g.filesInGroup.some((f) => f.id === selectedFileId));
    return idx >= 0 ? idx : null;
  }, [selectedFileId, bindingGroups, files.length]);

  const spiralType = selectedGroupIndex !== null ? (groupOptions[selectedGroupIndex] ?? defaultGroupOpts).spiralType : defaultGroupOpts.spiralType;
  const spiralColor = selectedGroupIndex !== null ? (groupOptions[selectedGroupIndex] ?? defaultGroupOpts).spiralColor : defaultGroupOpts.spiralColor;
  const coverBackColor = selectedGroupIndex !== null ? (groupOptions[selectedGroupIndex] ?? defaultGroupOpts).coverBackColor : defaultGroupOpts.coverBackColor;

  const updateSelectedGroupOptions = useCallback((patch: Partial<typeof defaultGroupOpts>) => {
    if (selectedGroupIndex === null) return;
    setGroupOptions((prev) => ({
      ...prev,
      [selectedGroupIndex]: { ...defaultGroupOpts, ...prev[selectedGroupIndex], ...patch },
    }));
  }, [selectedGroupIndex]);

  const currentStep = useMemo(() => {
    if (files.length === 0) return 0;
    if (checkoutModalOpen) return 2;
    return 1;
  }, [files.length, checkoutModalOpen]);

  const loadPageCounts = useCallback(async (newFiles: UploadedFile[]) => {
    setIsLoadingPages(true);
    const updated = await Promise.all(
      newFiles.map(async (item) => {
        if (item.pages != null) return item;
        try {
          const colorAnalysis = await analyzePdfColors(item.file);
          return { ...item, pages: colorAnalysis.totalPages, colorAnalysis };
        } catch {
          try {
            const pages = await getPdfPageCount(item.file);
            return { ...item, pages };
          } catch {
            return { ...item, pages: null, error: "Nu am putut citi acest fișier. Verifică dacă e un PDF valid." };
          }
        }
      })
    );
    setFiles((prev) =>
      prev.map((f) => {
        const loaded = updated.find((u) => u.id === f.id);
        if (!loaded) return f;
        return { ...f, pages: loaded.pages ?? f.pages, error: loaded.error ?? f.error, colorAnalysis: loaded.colorAnalysis ?? f.colorAnalysis };
      })
    );
    setIsLoadingPages(false);
  }, []);

  const createFileItems = useCallback((fileList: File[]): UploadedFile[] => {
    let savedFileOpts: Record<string, { printMode?: string; duplex?: boolean; copies?: number }> = {};
    try {
      const raw = localStorage.getItem(LS_KEY_FILE_OPTS);
      if (raw) savedFileOpts = JSON.parse(raw);
    } catch { /* ignore */ }

    return fileList.map((file) => {
      const tooBig = file.size > MAX_FILE_SIZE_BYTES;
      const saved = savedFileOpts[file.name];
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        name: file.name,
        pages: null,
        error: tooBig ? FILE_SIZE_ERROR_MSG : undefined,
        printMode: (saved?.printMode === "color" ? "color" : "bw") as PrintMode,
        duplex: saved?.duplex ?? false,
        copies: saved?.copies ?? 1,
        previewUrl: URL.createObjectURL(file),
        groupWithPrevious: false,
      };
    });
  }, []);

  const createUploadablePdfCopies = useCallback(async (selectedFiles: File[]) => {
    const uploadableFiles: File[] = [];
    const blockedCloudFiles: string[] = [];
    const notPdfFiles: string[] = [];

    for (const file of selectedFiles) {
      try {
        const buffer = await file.arrayBuffer();
        // Validate PDF magic bytes (%PDF)
        const header = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
        const isPdfMagic = header.length >= 4 && header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46;
        if (!isPdfMagic) {
          notPdfFiles.push(file.name);
          continue;
        }
        uploadableFiles.push(
          new File([buffer], file.name, {
            type: "application/pdf",
            lastModified: file.lastModified || Date.now(),
          })
        );
      } catch {
        blockedCloudFiles.push(file.name);
      }
    }

    return { uploadableFiles, blockedCloudFiles, notPdfFiles };
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      // Accept all files — magic bytes validated in createUploadablePdfCopies
      const dropped = Array.from(e.dataTransfer.files);
      if (dropped.length === 0) return;
      const remaining = MAX_FILES - files.length;
      if (remaining <= 0) {
        addToast(`Poți adăuga maximum ${MAX_FILES} fișiere.`, "error");
        return;
      }
      const limited = dropped.slice(0, remaining);
      if (dropped.length > remaining) {
        addToast(`Ai putut adăuga doar ${remaining} fișier${remaining > 1 ? "e" : ""} (limită: ${MAX_FILES}).`, "error");
      }
      const newItems = createFileItems(limited);
      const tooBigFiles = newItems.filter((f) => f.error);
      const validNewFiles = newItems.filter((f) => !f.error);
      if (tooBigFiles.length > 0) {
        setRejectedFiles(tooBigFiles.map((f) => f.name));
      }
      if (validNewFiles.length === 0 && tooBigFiles.length > 0) return;
      setFiles((prev) => {
        const next = [...prev, ...validNewFiles];
        if (prev.length === 0 && validNewFiles.length > 0) setSelectedFileId(validNewFiles[0].id);
        return next;
      });
      if (validNewFiles.length > 0) {
        addToast(`${validNewFiles.length} fișier${validNewFiles.length > 1 ? "e" : ""} adăugat${validNewFiles.length > 1 ? "e" : ""}`, "success");
      }
      loadPageCounts([...files, ...validNewFiles]);
    },
    [files, loadPageCounts, createFileItems, addToast]
  );

  const onFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected?.length) return;
      const allFiles = Array.from(selected);

      // Enforce max files limit
      const remaining = MAX_FILES - files.length;
      if (remaining <= 0) {
        addToast(`Poți adăuga maximum ${MAX_FILES} fișiere.`, "error");
        e.target.value = "";
        return;
      }
      const limited = allFiles.slice(0, remaining);
      if (allFiles.length > remaining) {
        addToast(`Ai putut adăuga doar ${remaining} fișier${remaining > 1 ? "e" : ""} (limită: ${MAX_FILES}).`, "error");
      }

      // All files pass to createUploadablePdfCopies which validates magic bytes
      const pdfFiles = limited;

      const oversizedFiles = pdfFiles.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
      if (oversizedFiles.length > 0) {
        setRejectedFiles(oversizedFiles.map((f) => f.name));
      }

      const filesToCopy = pdfFiles.filter((f) => f.size <= MAX_FILE_SIZE_BYTES);
      
      // Show processing indicator for large/multiple files
      setIsProcessingFiles(true);
      try {
        const { uploadableFiles, blockedCloudFiles, notPdfFiles } = await createUploadablePdfCopies(filesToCopy);
        if (notPdfFiles.length > 0) {
          addToast(`${notPdfFiles.length} fișier${notPdfFiles.length > 1 ? "e" : ""} nu ${notPdfFiles.length > 1 ? "sunt" : "este"} PDF valid${notPdfFiles.length > 1 ? "e" : ""}.`, "error");
        }
        if (blockedCloudFiles.length > 0) {
          blockedCloudFiles.forEach((name) => {
            addToast(`Fișierul "${name}" nu poate fi încărcat din Drive/Dropbox. Descarcă-l pe telefon și încarcă-l din memoria internă.`, "error");
          });
        }
        if (uploadableFiles.length === 0) { e.target.value = ""; return; }

        const newItems = createFileItems(uploadableFiles);
        const tooBigFiles = newItems.filter((f) => f.error);
        const validNewFiles = newItems.filter((f) => !f.error);
        if (tooBigFiles.length > 0) {
          setRejectedFiles(tooBigFiles.map((f) => f.name));
        }
        if (validNewFiles.length === 0 && tooBigFiles.length > 0) return;
        setFiles((prev) => {
          const next = [...prev, ...validNewFiles];
          if (prev.length === 0 && validNewFiles.length > 0) setSelectedFileId(validNewFiles[0].id);
          return next;
        });
        if (validNewFiles.length > 0) {
          addToast(`${validNewFiles.length} fișier${validNewFiles.length > 1 ? "e" : ""} adăugat${validNewFiles.length > 1 ? "e" : ""}`, "success");
        }
        loadPageCounts([...files, ...validNewFiles]);
      } finally {
        setIsProcessingFiles(false);
      }
      e.target.value = "";
    },
    [files, loadPageCounts, createFileItems, createUploadablePdfCopies, addToast]
  );

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const toRemove = prev.find((f) => f.id === id);
      if (toRemove?.previewUrl) URL.revokeObjectURL(toRemove.previewUrl);
      const next = prev.filter((f) => f.id !== id);
      if (selectedFileId === id) setSelectedFileId(next.length > 0 ? next[0].id : null);
      return next;
    });
    if (previewFileId === id) setPreviewFileId(null);
  };

  const moveFileUp = (id: string) => {
    setFiles((prev) => {
      const i = prev.findIndex((f) => f.id === id);
      if (i <= 0) return prev;
      const wasFirstInGroup = prev[i].groupWithPrevious === false;
      const next = [...prev];
      [next[i - 1], next[i]] = [{ ...prev[i] }, { ...prev[i - 1] }];
      const upGroupWithPrevious = i - 1 === 0 ? false : next[i - 2].groupWithPrevious === true;
      const downGroupWithPrevious = wasFirstInGroup ? false : upGroupWithPrevious;
      next[i - 1] = { ...next[i - 1], groupWithPrevious: upGroupWithPrevious };
      next[i] = { ...next[i], groupWithPrevious: downGroupWithPrevious };
      return next;
    });
    setScrollToFileId(id);
  };

  const moveFileDown = (id: string) => {
    setFiles((prev) => {
      const i = prev.findIndex((f) => f.id === id);
      if (i < 0 || i >= prev.length - 1) return prev;
      const wasLastInGroup = prev[i].groupWithPrevious === true && (i === prev.length - 1 || prev[i + 1].groupWithPrevious === false);
      const next = [...prev];
      [next[i], next[i + 1]] = [{ ...prev[i + 1] }, { ...prev[i] }];
      const upGroupWithPrevious = i === 0 ? false : next[i - 1].groupWithPrevious === true;
      const downGroupWithPrevious = wasLastInGroup ? false : upGroupWithPrevious;
      next[i] = { ...next[i], groupWithPrevious: upGroupWithPrevious };
      next[i + 1] = { ...next[i + 1], groupWithPrevious: downGroupWithPrevious };
      return next;
    });
    setScrollToFileId(id);
  };

  useEffect(() => {
    if (!scrollToFileId) return;
    const timer = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-file-id="${scrollToFileId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      setScrollToFileId(null);
    });
    return () => cancelAnimationFrame(timer);
  }, [scrollToFileId]);

  // ─── localStorage persistence ──────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem(LS_KEY_SHIPPING, JSON.stringify(shipping)); } catch { /* ignore */ }
  }, [shipping]);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY_PAYMENT, paymentMethod); } catch { /* ignore */ }
  }, [paymentMethod]);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY_DELIVERY, deliveryMethod); } catch { /* ignore */ }
  }, [deliveryMethod]);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY_GROUP_OPTS, JSON.stringify(groupOptions)); } catch { /* ignore */ }
  }, [groupOptions]);

  useEffect(() => {
    if (files.length === 0) return;
    try {
      const opts: Record<string, { printMode: string; duplex: boolean; copies: number }> = {};
      files.forEach((f) => {
        opts[f.name] = { printMode: f.printMode, duplex: f.duplex, copies: f.copies };
      });
      localStorage.setItem(LS_KEY_FILE_OPTS, JSON.stringify(opts));
    } catch { /* ignore */ }
  }, [files]);

  // ─── Optimistic file removal with animation ───────────────────────────────
  const [removingFileId, setRemovingFileId] = useState<string | null>(null);

  const removeFileAnimated = useCallback((id: string) => {
    setRemovingFileId(id);
    setTimeout(() => {
      removeFile(id);
      setRemovingFileId(null);
    }, 250);
  }, []);

  // ─── Price calculations ────────────────────────────────────────────────────
  const totalPages = files.reduce(
    (sum, f) => sum + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
    0
  );

  const detectedColorPages = files.reduce((sum, f) => {
    if (f.pages == null) return sum;
    const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
    const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
    if (mode === "color" && f.colorAnalysis) return sum + f.colorAnalysis.colorPages * copies;
    return sum;
  }, 0);

  const detectedBwPages = files.reduce((sum, f) => {
    if (f.pages == null) return sum;
    const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
    const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
    if (mode === "color" && f.colorAnalysis) return sum + f.colorAnalysis.bwPages * copies;
    if (mode === "bw") return sum + f.pages * copies;
    return sum;
  }, 0);

  const userChosenColorPages = files.reduce(
    (sum, f) =>
      sum + (f.pages != null && (f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode) === "color" ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
    0
  );

  const pagePrice = files.reduce((sum, f) => sum + calculateFilePrice(f), 0);

  const spiralPrice = useMemo(() => {
    let sum = 0;
    bindingGroups.forEach((grp, groupIndex) => {
      const groupPages = grp.filesInGroup.reduce(
        (s, f) => s + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
        0
      );
      const opts = groupOptions[groupIndex] ?? defaultGroupOpts;
      if (groupPages > 0 && opts.spiralType === "spirala") {
        // Spiral price per copy (use max copies in group)
        const maxCopies = Math.max(...grp.filesInGroup.map(f => f.copies ?? 1));
        sum += SPIRAL_PRICE * maxCopies;
      }
    });
    return sum;
  }, [bindingGroups, groupOptions]);

  const totalPrice = pagePrice + spiralPrice;
  const effectivePrice = deliveryMethod === "ridicare" ? totalPrice : Math.max(totalPrice, totalPages > 0 ? MIN_ORDER_LEI : 0);
  const shippingCost = deliveryMethod === "ridicare" ? 0 : SHIPPING_COST_LEI;
  const totalWithShipping = effectivePrice + shippingCost;

  // ─── Options data ──────────────────────────────────────────────────────────
  const coverBackColors: { value: CoverBackColor; label: string; circleClass: string }[] = [
    { value: "negru", label: "Negru", circleClass: "bg-slate-800" },
    { value: "alb", label: "Alb", circleClass: "bg-white border border-slate-200 shadow-inner" },
    { value: "albastru_inchis", label: "Albastru închis", circleClass: "bg-blue-900" },
    { value: "galben", label: "Galben", circleClass: "bg-yellow-400" },
    { value: "rosu", label: "Roșu", circleClass: "bg-red-500" },
    { value: "verde", label: "Verde", circleClass: "bg-green-600" },
  ];

  const spiralColorOptions: { value: SpiralColorOption; label: string; circleClass: string }[] = [
    { value: "negru", label: "Negru", circleClass: "bg-slate-800" },
  ];

  // Calculate sheets for capsare (duplex = 1 sheet per 2 pages)
  const getGroupSheets = (filesInGroup: UploadedFile[]) => {
    return filesInGroup.reduce((s, f) => {
      if (f.pages == null) return s;
      const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
      const totalPages = f.pages * copies;
      const sheets = f.duplex ? Math.ceil(totalPages / 2) : totalPages;
      return s + sheets;
    }, 0);
  };

  const selectedGroupSheets =
    selectedGroupIndex !== null
      ? getGroupSheets(bindingGroups[selectedGroupIndex].filesInGroup)
      : files.reduce((s, f) => {
          if (f.pages == null) return s;
          const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
          const totalPages = f.pages * copies;
          return s + (f.duplex ? Math.ceil(totalPages / 2) : totalPages);
        }, 0);

  const selectedGroupPages =
    selectedGroupIndex !== null
      ? bindingGroups[selectedGroupIndex].filesInGroup.reduce(
          (s, f) => s + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
          0
        )
      : totalPages;

  const selectedGroupMaxCopies = selectedGroupIndex !== null
    ? Math.max(...bindingGroups[selectedGroupIndex].filesInGroup.map(f => f.copies ?? 1))
    : 1;

  const spiralOptions: { value: SpiralType; label: string; icon: React.ReactNode; description: string }[] = [
    { value: "none", label: "Doar print", icon: <BookOpen className="h-6 w-6" />, description: "Fără legare" },
    { value: "spirala", label: "Spiralare", icon: <Circle className="h-6 w-6" />, description: selectedGroupMaxCopies > 1 ? `+${(SPIRAL_PRICE * selectedGroupMaxCopies).toFixed(0)}  RON (${SPIRAL_PRICE}  RON × ${selectedGroupMaxCopies} copii)` : `+${SPIRAL_PRICE} RON` },
    { value: "perforare2", label: "Perforare", icon: <BookMarked className="h-6 w-6" />, description: "2 găuri" },
    { value: "capsare", label: "Capsare", icon: <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M7 3 L7 7 L11 7" /><line x1="7" y1="3" x2="7" y2="7" strokeWidth="2.5" /><line x1="7" y1="7" x2="11" y2="7" strokeWidth="2.5" /></svg>, description: `Max ${MAX_CAPSARE_SHEETS} file` },
  ];

  // ─── Body scroll lock for modals ─────────────────────────────────────────
  useEffect(() => {
    if (checkoutModalOpen || orderSuccessDetails || previewFileId) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [checkoutModalOpen, orderSuccessDetails, previewFileId]);

  // ─── Checkout handler ──────────────────────────────────────────────────────
  const handleOpenCheckout = () => {
    setCheckoutError(null);
    setOrderSuccess(null);
    setCheckoutModalOpen(true);
  };

  const handleSubmitCheckout = async () => {
    const errors = validateShipping(shipping, deliveryMethod);
    if (Object.keys(errors).length > 0) {
      setShippingErrors(errors);
      setCheckoutError("Te rugăm completează corect toate câmpurile obligatorii.");
      return;
    }
    setShippingErrors({});
    setCheckoutError(null);
    setIsCheckoutLoading(true);
    const { name, phone, email, address } = shipping;

    const capsareError = bindingGroups.some((grp, groupIndex) => {
      const opts = groupOptions[groupIndex] ?? defaultGroupOpts;
      if (opts.spiralType !== "capsare") return false;
      const groupSheets = getGroupSheets(grp.filesInGroup);
      return groupSheets > MAX_CAPSARE_SHEETS;
    });
    if (capsareError) {
      setCheckoutError(`Capsarea nu este disponibilă pentru documente cu mai mult de ${MAX_CAPSARE_SHEETS} de file. Alege alt tip de legare.`);
      setIsCheckoutLoading(false);
      return;
    }

    try {
      const validFiles = files.filter((f) => !f.error);
      if (validFiles.length === 0) {
        setCheckoutError("Adaugă cel puțin un fișier PDF valid (max 50 MB per fișier).");
        setIsCheckoutLoading(false);
        return;
      }
      const fileList = validFiles.map((f) => f.file);
      let fileUrls: string[] = [];
      if (fileList.length > 0) {
        setIsUploading(true);
        setUploadProgress(0);
        try {
          // Step 1: Get signed upload URLs from server (lightweight JSON request)
          const signRes = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ files: fileList.map((f) => ({ name: f.name })) }),
          });
          let signData: Record<string, unknown> = {};
          const signText = await signRes.text();
          try { signData = JSON.parse(signText); } catch { signData = { error: signText?.slice(0, 200) || "Răspuns invalid de la server." }; }
          if (!signRes.ok) throw new Error((signData.error as string) || `Eroare la pregătirea încărcării (${signRes.status}).`);

          const signed = signData.signed as { path: string; signedUrl: string; publicUrl: string }[];
          if (!signed || signed.length !== fileList.length) throw new Error("Eroare la pregătirea încărcării.");

          // Step 2: Upload each file directly to Supabase Storage using signed URLs
          
          for (let i = 0; i < fileList.length; i++) {
            const file = fileList[i];
            const { signedUrl, publicUrl } = signed[i];
            setUploadProgress(Math.round(((i) / fileList.length) * 90));

            const uploadRes = await fetch(signedUrl, {
              method: "PUT",
              headers: { "Content-Type": "application/pdf" },
              body: file,
            });

            if (!uploadRes.ok) {
              const errText = await uploadRes.text().catch(() => "");
              throw new Error(`Eroare la încărcarea fișierului "${file.name}": ${errText.slice(0, 100) || uploadRes.status}`);
            }

            fileUrls.push(publicUrl);
          }

          setUploadProgress(100);
        } finally {
          setTimeout(() => {
            setIsUploading(false);
            setUploadProgress(0);
          }, 500);
        }
      }

      const validBindingGroups = getBindingGroups(validFiles);
      const validBindingOptions = validBindingGroups.map((validGrp) => {
        const fileId = validGrp.filesInGroup[0].id;
        const origIdx = bindingGroups.findIndex((g) => g.filesInGroup.some((f) => f.id === fileId));
        const opts = origIdx >= 0 ? (groupOptions[origIdx] ?? defaultGroupOpts) : defaultGroupOpts;
        return {
          spiralType: opts.spiralType,
          ...(opts.spiralType !== "none" && { spiralColor: opts.spiralColor }),
          ...(opts.spiralType === "spirala" && { coverBackColor: opts.coverBackColor }),
        };
      });
      const config_details = {
        files: validFiles.map((f) => ({
          name: f.name,
          pages: f.pages,
          printMode: f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode,
          duplex: f.duplex ?? DEFAULT_PRINT_OPTIONS.duplex,
          copies: f.copies,
        })),
        bindingGroupSizes: validBindingGroups.map((g) => g.filesInGroup.length),
        bindingOptions: validBindingOptions,
        spiralType: validBindingOptions[0]?.spiralType ?? "none",
        ...(validBindingOptions[0]?.spiralType !== "none" && { spiralColor: validBindingOptions[0].spiralColor }),
        ...(validBindingOptions[0]?.spiralType === "spirala" && {
          coverFrontColor: "transparent",
          coverBackColor: validBindingOptions[0]?.coverBackColor ?? "negru",
        }),
      };

      const orderRes = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: JSON.stringify(fileUrls),
          total_price: totalWithShipping,
          payment_method: paymentMethod,
          status: "pending",
          customer_email: email.trim().toLowerCase(),
          phone: phone.trim().replace(/\s/g, ""),
          customer_name: name.trim(),
          shipping_address: deliveryMethod === "ridicare" ? `RIDICARE: ${PICKUP_ADDRESS}` : address.trim(),
          config_details: { ...config_details, deliveryMethod },
        }),
      });
      const orderText = await orderRes.text();
      let orderData: Record<string, unknown> = {};
      try { orderData = JSON.parse(orderText); } catch { orderData = { error: orderText?.slice(0, 200) || "Răspuns invalid de la server." }; }
      if (!orderRes.ok) throw new Error((orderData.error as string) || "Nu am putut salva comanda. Verifică conexiunea la internet și încearcă din nou.");

      // Send confirmation email (fire-and-forget)
      fetch("/api/send-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email.trim().toLowerCase(),
          customerName: name.trim(),
          totalPrice: totalWithShipping,
          paymentMethod,
          groups: validBindingGroups.map((grp, groupIndex) => {
            const opts = validBindingOptions[groupIndex] ?? defaultGroupOpts;
            return {
              files: grp.filesInGroup.map((f) => ({
                name: f.name,
                pages: f.pages,
                printMode: f.printMode ?? "bw",
                duplex: f.duplex ?? false,
                copies: f.copies ?? 1,
              })),
              spiralType: opts.spiralType,
              spiralColor: opts.spiralColor,
              coverBackColor: opts.coverBackColor,
            };
          }),
          shippingAddress: deliveryMethod === "ridicare" ? `RIDICARE: ${PICKUP_ADDRESS}` : address.trim(),
          deliveryMethod,
        }),
      }).catch(() => {});
      // Curățăm localStorage acum că comanda a fost trimisă cu succes
      try {
        localStorage.removeItem(LS_KEY_SHIPPING);
        localStorage.removeItem(LS_KEY_PAYMENT);
        localStorage.removeItem(LS_KEY_DELIVERY);
        localStorage.removeItem(LS_KEY_GROUP_OPTS);
        localStorage.removeItem(LS_KEY_FILE_OPTS);
      } catch { /* ignore */ }

      if (paymentMethod === "ramburs") {
        setOrderSuccessDetails({
          paymentMethod: "ramburs",
          deliveryMethod,
          groups: validBindingGroups.map((grp, groupIndex) => {
            const opts = validBindingOptions[groupIndex] ?? defaultGroupOpts;
            return {
              files: grp.filesInGroup.map((f) => ({
                name: f.name,
                pages: f.pages,
                printMode: f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode,
                duplex: f.duplex ?? DEFAULT_PRINT_OPTIONS.duplex,
                copies: f.copies ?? DEFAULT_PRINT_OPTIONS.copies,
              })),
              spiralType: opts.spiralType,
              spiralColor: opts.spiralColor ?? "negru",
              coverBackColor: opts.coverBackColor ?? "negru",
            };
          }),
          totalPages,
          totalPrice,
          totalWithShipping,
        });
        setCheckoutModalOpen(false);
        setFiles([]);
        setSelectedFileId(null);
        addToast("Comanda a fost plasată cu succes!", "success");
        return;
      }

      const fileUrlMeta: Record<string, string> = {};
      fileUrls.forEach((url, i) => { fileUrlMeta[`file_url_${i}`] = url; });
      const coverColorSummary = `fata:transparent;spate:${coverBackColor}`;
      
      const orderId = orderData.id;

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          metadata: {
            order_id: orderId,
            total_pages: String(totalPages),
            print_mode: files[0]?.printMode ?? "bw",
            duplex: String(files[0]?.duplex ?? false),
            spiral_type: spiralType,
            spiral_color: spiralType !== "none" ? spiralColor : "",
            cover_color: coverColorSummary,
            file_names: validFiles.length ? JSON.stringify(validFiles.map((f) => f.name)) : "[]",
            total_lei: String(totalWithShipping),
            shipping_name: name.trim(),
            shipping_phone: phone.trim().replace(/\s/g, ""),
            shipping_email: email.trim().toLowerCase(),
            shipping_address: address.trim(),
            ...fileUrlMeta,
          },
        }),
      });
      const checkoutText = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(checkoutText); } catch { data = { error: checkoutText?.slice(0, 200) || "Răspuns invalid de la server." }; }
      if (!res.ok) throw new Error((data.error as string) || "Nu am putut iniția plata. Încearcă din nou.");

      // Legăm sesiunea Stripe de comandă
      if (data.id && orderId) {
        await fetch(`/api/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stripe_session_id: data.id }),
        });
      }

      if (data.url) {
        window.location.href = data.url as string;
      } else {
        throw new Error("Nu s-a putut deschide pagina de plată. Încearcă din nou.");
      }
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : "A apărut o problemă. Te rugăm încearcă din nou.";
      const friendlyMsg = rawMessage === "Failed to fetch"
        ? "Fișierul selectat nu mai poate fi citit. Dacă l-ai ales din Drive sau Dropbox, descarcă-l pe telefon și încarcă-l din memoria internă."
        : rawMessage;
      setCheckoutError(friendlyMsg);
      addToast(friendlyMsg, "error");
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ─── Render ────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
      {/* Toasts */}
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
      ))}

      <div className="mx-auto max-w-6xl px-4 py-4 pb-24 sm:px-6 sm:py-6 lg:px-8 lg:pb-6">
        {/* Header */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
           <div className="min-w-0 flex-1 text-center lg:text-left">
            <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
              <Printer className="h-3.5 w-3.5" />
              Rapid · Sigur · Stripe
            </div>
            <div className="flex items-center justify-center lg:justify-start gap-2.5 bg-transparent">
              <img src="/logo-symbol.png" className="h-9 sm:h-10 w-auto shrink-0" alt="Printica" style={{ border: 'none', outline: 'none' }} />
              <span className="text-2xl sm:text-3xl text-transparent bg-clip-text bg-gradient-to-r from-[#00D1FF] to-[#0096C7]" style={{ fontFamily: "'Pacifico', cursive" }}>
                Printica
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600 sm:text-base">
              Încarcă PDF-urile, configurează opțiunile și plătește în siguranță.
            </p>
            <a href="/contact" className="mt-1 inline-flex items-center gap-1 text-xs text-cyan-600 hover:text-cyan-800 transition-colors font-medium">
              <Phone className="h-3 w-3" />
              Contact
            </a>
          </div>
          <section className="shrink-0 w-full max-w-full rounded-xl border border-slate-200/80 bg-white shadow-sm lg:w-auto lg:self-start">
            <div className="flex flex-col">
              <div className="shrink-0 bg-slate-50/80 px-2.5 py-1.5 border-b border-slate-200/80">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600 sm:text-xs">Prețuri</p>
              </div>
              <div className="shrink-0">
                <div className="grid grid-cols-3 gap-1 p-1.5 text-xs sm:gap-1.5 sm:p-2 sm:text-xs">
                  <div className="rounded-md border border-slate-100 bg-slate-50/50 px-1.5 py-1">
                    <p className="text-slate-600 leading-tight truncate">Alb-negru 1 față</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{PRICE_BW_ONE_SIDE} RON</p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50/50 px-1.5 py-1">
                    <p className="text-slate-600 leading-tight truncate">Alb-negru față-verso</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{PRICE_BW_DUPLEX} RON</p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50/50 px-1.5 py-1">
                    <p className="text-slate-600 leading-tight truncate">Color 1 față</p>
                    <p className="mt-0.5 font-semibold text-black tabular-nums">{PRICE_COLOR_ONE_SIDE} RON</p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50/50 px-1.5 py-1">
                    <p className="text-slate-600 leading-tight truncate">Color față-verso</p>
                    <p className="mt-0.5 font-semibold text-black tabular-nums">{PRICE_COLOR_DUPLEX} RON</p>
                  </div>
                  <div className="rounded-md border border-slate-100 bg-slate-50/50 px-1.5 py-1">
                    <p className="text-slate-600 leading-tight truncate">Spiralare</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{SPIRAL_PRICE} RON</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </header>

        {/* ═══ Delivery Banner ═══ */}
        <div className="mt-3 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 to-cyan-50 px-3 py-2 sm:px-5">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs">
            <div className="flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-emerald-600" />
              <span className="font-medium text-emerald-800">Livrare în 2-4 zile lucrătoare</span>
            </div>
            <div className="hidden sm:block h-3.5 w-px bg-emerald-300" />
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-700">Transport {SHIPPING_COST_LEI} RON</span>
            </div>
          </div>
        </div>

        {/* ═══ Color Detection Highlight ═══ */}
        <div className="mt-2 rounded-lg border border-cyan-200 bg-gradient-to-r from-cyan-50 via-white to-cyan-50 px-3 py-2 sm:px-5">
          <div className="flex items-start gap-2.5">
            <div className="flex-shrink-0 mt-0.5 rounded-full bg-cyan-100 p-1.5">
              <Palette className="h-4 w-4 text-cyan-600" />
            </div>
            <div>
              <p className="text-xs font-semibold text-cyan-900">Plătești color doar pentru paginile colorate</p>
              <p className="mt-0.5 text-[11px] text-cyan-700/80">
                Când selectezi printul <strong>Color</strong>, analizăm automat fiecare pagină din PDF — paginile alb-negru 
                se taxează la preț de alb-negru, iar restul la preț de color. Economisești fără efort.
                <span className="block mt-0.5 text-cyan-600/70 italic">Nu se aplică documentelor formate din imagini scanate.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Progress Stepper */}
        <div className="mt-4">
          <ProgressStepper currentStep={currentStep} />
        </div>

        {/* ═══ Step 0: Empty state — full drop zone ═══ */}
        {files.length === 0 ? (
          <div className="relative mx-auto w-full max-w-2xl">
            {isProcessingFiles && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-white/90 backdrop-blur-sm">
                <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
                <p className="mt-3 text-sm font-medium text-slate-700">Se procesează documentele selectate…</p>
                <p className="mt-1 text-xs text-slate-400">Poate dura câteva secunde pentru fișiere mari</p>
              </div>
            )}
            <label
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`drop-zone flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
                isDragging
                  ? "border-cyan-500 bg-cyan-50/90 shadow-inner scale-[1.01]"
                  : "border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/50 hover:shadow-[var(--shadow)]"
              }`}
            >
              <input type="file" accept=".pdf,application/pdf,application/x-pdf,application/octet-stream" multiple onChange={onFileInput} className="hidden" />
              {/* Custom illustration */}
              <div className="relative mb-4">
                <div className={`drop-zone-icon flex h-24 w-24 items-center justify-center rounded-2xl ${isDragging ? "bg-cyan-100" : "bg-gradient-to-br from-cyan-50 to-slate-100"} transition-colors`}>
                  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* Paper stack */}
                    <rect x="14" y="12" width="28" height="36" rx="3" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5"/>
                    <rect x="11" y="9" width="28" height="36" rx="3" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5"/>
                    <rect x="8" y="6" width="28" height="36" rx="3" fill="white" stroke="#64748b" strokeWidth="1.5"/>
                    {/* Lines on paper */}
                    <line x1="14" y1="16" x2="30" y2="16" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="14" y1="21" x2="28" y2="21" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="14" y1="26" x2="26" y2="26" stroke="#cbd5e1" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="14" y1="31" x2="24" y2="31" stroke="#e2e8f0" strokeWidth="1.5" strokeLinecap="round"/>
                    {/* Upload arrow */}
                    <circle cx="38" cy="38" r="12" fill="url(#uploadGrad)" opacity="0.9"/>
                    <defs><linearGradient id="uploadGrad" x1="26" y1="26" x2="50" y2="50"><stop offset="0%" stopColor="#00D1FF"/><stop offset="100%" stopColor="#00FFD1"/></linearGradient></defs>
                    <path d="M38 44V33M38 33L33 38M38 33L43 38" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500 text-white shadow-md">
                  <Plus className="h-4 w-4" />
                </div>
              </div>
              <p className="text-center text-slate-700 text-base font-semibold">
                Trage fișierele PDF aici
              </p>
              <p className="mt-1 text-center text-slate-500 text-sm">
                sau{" "}
                <span className="font-semibold text-cyan-600 underline decoration-cyan-500/30 underline-offset-2">
                  click pentru a selecta
                </span>
              </p>
              <div className="mt-4 flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Doar PDF</span>
                <span className="h-3 w-px bg-slate-300" />
                <span>Max 50 MB / fișier</span>
                <span className="h-3 w-px bg-slate-300" />
                <span>Până la 20 fișiere</span>
              </div>
            </label>
          </div>
        ) : (
          <>
            {/* ═══ Step 1: Files loaded — configure ═══ */}
            <div className="relative grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,420px)_1fr] lg:gap-8">
              {isProcessingFiles && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl bg-white/90 backdrop-blur-sm">
                  <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
                  <p className="mt-3 text-sm font-medium text-slate-700">Se procesează documentele selectate…</p>
                  <p className="mt-1 text-xs text-slate-400">Poate dura câteva secunde pentru fișiere mari</p>
                </div>
              )}
              {/* ─── Left: File list ─── */}
              <div className="flex min-h-0 flex-col">
                {/* Compact add-more drop zone */}
                <label
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`mb-4 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-5 py-5 transition-all duration-200 ${
                    isDragging
                      ? "border-cyan-500 bg-cyan-100 shadow-md"
                      : "border-cyan-400 bg-gradient-to-r from-cyan-50 to-cyan-100/60 hover:border-cyan-500 hover:bg-cyan-100 hover:shadow-sm"
                  }`}
                >
                  <input ref={fileInputRef} type="file" accept=".pdf,application/pdf,application/x-pdf,application/octet-stream" multiple onChange={onFileInput} className="hidden" />
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${isDragging ? "bg-cyan-300 text-cyan-800" : "bg-cyan-200 text-cyan-700"}`}>
                    <Plus className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-cyan-800">+ Adaugă alte fișiere PDF</p>
                    <p className="text-xs text-cyan-600/80">Trage aici sau click pentru a selecta</p>
                  </div>
                </label>

                {/* Rejected files warning banner */}
                {rejectedFiles.length > 0 && (
                  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-amber-800">
                          {rejectedFiles.length === 1 ? "Un fișier nu a putut fi încărcat" : `${rejectedFiles.length} fișiere nu au putut fi încărcate`}
                        </p>
                        <p className="mt-1 text-xs text-amber-700">
                          {rejectedFiles.map((n) => `„${n}"`).join(", ")} {rejectedFiles.length === 1 ? "depășește" : "depășesc"} limita de 50 MB per fișier.
                          Poți reduce dimensiunea comprimând PDF-ul sau eliminând paginile inutile, apoi reîncarcă.
                        </p>
                        <button
                          type="button"
                          onClick={() => setRejectedFiles([])}
                          className="mt-2 rounded-lg bg-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-300 transition-colors"
                        >
                          Am înțeles
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <h2 className="mb-3 flex shrink-0 items-center gap-2 text-base font-semibold text-slate-800">
                  <FileText className="h-5 w-5 text-cyan-600" />
                  Fișiere încărcate
                  <span className="ml-2 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {files.length}
                  </span>
                </h2>

                {files.length >= 2 && (
                  <div className="mb-3 flex items-start gap-2.5 rounded-xl border border-cyan-200 bg-cyan-50/80 px-4 py-3">
                    <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
                    <div className="text-xs text-cyan-800">
                      <p className="font-semibold">Vrei să legi mai multe fișiere într-o singură spirală?</p>
                      <p className="mt-0.5 text-cyan-700">
                        Apasă butonul <span className="inline-flex items-center gap-0.5 font-semibold"><Link2 className="inline h-3 w-3" /> Leagă împreună</span> dintre două fișiere.
                      </p>
                    </div>
                  </div>
                )}

                <div className="min-h-0 overflow-x-hidden overflow-y-auto rounded-xl border-2 border-slate-200 bg-slate-50/50 pr-1 shadow-inner" style={{ maxHeight: "min(65vh, 520px)" }}>
                  <ul className="space-y-0 py-1 px-1">
                    {files.map((item, globalIndex) => {
                      const groupInfo = bindingGroups.find((g) => g.filesInGroup.some((f) => f.id === item.id));
                      const isInGroup = groupInfo ? groupInfo.filesInGroup.length > 1 : false;
                      const isFirstInGroup = isInGroup && groupInfo!.filesInGroup[0].id === item.id;
                      const isLastInGroup = isInGroup && groupInfo!.filesInGroup[groupInfo!.filesInGroup.length - 1].id === item.id;
                      const nextItem = globalIndex < files.length - 1 ? files[globalIndex + 1] : null;
                      const isLinkedToNext = nextItem?.groupWithPrevious === true;
                      const filePrice = calculateFilePrice(item);

                      return (
                        <li key={item.id} className="list-none">
                          {isFirstInGroup && (
                            <div className="mt-2 flex items-center gap-2 rounded-t-xl border-2 border-b-0 border-cyan-300 bg-gradient-to-r from-cyan-100 to-cyan-50 px-4 py-2.5">
                              <BookMarked className="h-4 w-4 text-cyan-600 shrink-0" />
                              <span className="text-sm font-bold text-cyan-800">
                                Volum spiralat · {groupInfo!.filesInGroup.length} fișiere legate
                              </span>
                            </div>
                          )}

                          <div
                            data-file-id={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelectedFileId(item.id)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedFileId(item.id); } }}
                            className={`file-list-item flex items-center gap-3 px-4 py-3 transition-all duration-200 ${
                              removingFileId === item.id ? "opacity-0 scale-95 -translate-x-4" : ""
                            } ${
                              selectedFileId === item.id
                                ? "ring-2 ring-cyan-500 ring-offset-1 bg-white shadow-[var(--shadow)]"
                                : "bg-white shadow-[var(--shadow)] ring-1 ring-slate-200/80 hover:ring-slate-300 hover:shadow-[var(--shadow-md)]"
                            } ${
                              isInGroup
                                ? `border-x-2 border-cyan-300 ${!isFirstInGroup ? "border-t border-t-cyan-200/60" : "border-t-0"} ${isLastInGroup ? "border-b-2 rounded-b-xl" : "border-b-0"} ring-0 shadow-none`
                                : "rounded-xl"
                            }`}
                            style={{ animationDelay: `${globalIndex * 60}ms` }}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                              <FileText className="h-5 w-5 text-slate-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-slate-800">{item.name}</p>
                              <p className="text-sm text-slate-500">
                                {item.pages != null ? (
                                  <span>
                                    {item.pages} pag. · {item.copies ?? 1} {(item.copies ?? 1) > 1 ? "copii" : "copie"} ·{" "}
                                    {(item.printMode ?? "bw") === "color" ? "Color" : "Alb-negru"}
                                    {item.duplex ? " · Duplex" : ""}
                                  </span>
                                ) : item.error ? (
                                  <span className="text-red-600">{item.error}</span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Se procesează…
                                  </span>
                                )}
                              </p>
                              {/* Color analysis per file */}
                              {item.pages != null && (item.printMode ?? "bw") === "color" && item.colorAnalysis && (
                                <p className="mt-0.5 text-xs text-slate-500">
                                  <span className="inline-flex items-center gap-1">
                                    <span className="inline-block h-2 w-2 rounded-full bg-cyan-500" />
                                    <span className="font-semibold text-cyan-600">{item.colorAnalysis.colorPages}</span> color
                                  </span>
                                  <span className="mx-1 text-slate-300">·</span>
                                  <span className="inline-flex items-center gap-1">
                                    <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                                    <span className="font-semibold text-slate-600">{item.colorAnalysis.bwPages}</span> alb-negru
                                  </span>
                                </p>
                              )}
                              {item.pages != null && (item.printMode ?? "bw") === "color" && !item.colorAnalysis && (
                                <p className="mt-0.5 text-xs text-amber-600">Toate paginile taxate ca color</p>
                              )}
                              {/* Price per file */}
                              {item.pages != null && (() => {
                                const groupInfo2 = bindingGroups.find((g) => g.filesInGroup.some((f) => f.id === item.id));
                                const groupIdx2 = groupInfo2 ? bindingGroups.indexOf(groupInfo2) : -1;
                                const opts2 = groupIdx2 >= 0 ? (groupOptions[groupIdx2] ?? defaultGroupOpts) : defaultGroupOpts;
                                const hasSpiralForFile = opts2.spiralType === "spirala";
                                const isFirstInGrp = groupInfo2 ? groupInfo2.filesInGroup[0].id === item.id : false;
                                const spiralPriceForFile = hasSpiralForFile && isFirstInGrp ? SPIRAL_PRICE * (item.copies ?? 1) : 0;
                                return (
                                  <p className="mt-0.5 text-xs font-semibold text-cyan-600 tabular-nums">
                                    {filePrice.toFixed(2)} RON{spiralPriceForFile > 0 ? ` + ${spiralPriceForFile.toFixed(2)}  RON spiralare` : ""}
                                  </p>
                                );
                              })()}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); moveFileUp(item.id); }}
                                  disabled={globalIndex === 0}
                                  className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
                                  aria-label="Mută sus"
                                >
                                  <ChevronUp className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); moveFileDown(item.id); }}
                                  disabled={globalIndex === files.length - 1}
                                  className="rounded-md p-1 text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40"
                                  aria-label="Mută jos"
                                >
                                  <ChevronDown className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              {item.previewUrl && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setPreviewFileId(item.id); }}
                                  className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                                >
                                  Preview
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeFileAnimated(item.id); }}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                                aria-label="Șterge"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          {nextItem && (
                            <div className="relative flex items-center justify-center py-1.5">
                              <div className={`absolute inset-x-8 top-1/2 h-px ${isLinkedToNext ? "bg-cyan-300" : "bg-slate-200"}`} />
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setFiles((prev) => prev.map((f, i) => i === globalIndex + 1 ? { ...f, groupWithPrevious: !nextItem.groupWithPrevious } : f));
                                }}
                                className={`relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                                  isLinkedToNext
                                    ? "bg-cyan-600 text-white shadow-md hover:bg-cyan-700 ring-2 ring-cyan-200"
                                    : "bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:ring-cyan-300 hover:text-cyan-700 hover:bg-cyan-50"
                                }`}
                                title={isLinkedToNext ? "Separă" : "Leagă împreună"}
                              >
                                {isLinkedToNext ? <><Unlink2 className="h-3.5 w-3.5" />Separă</> : <><Link2 className="h-3.5 w-3.5" />Leagă</>}
                              </button>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {isLoadingPages && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Se procesează fișierele…
                  </p>
                )}
              </div>

              {/* ─── Right: Config panel ─── */}
              <div className="lg:sticky lg:top-6 lg:self-start space-y-5">
                <section className="rounded-2xl border-2 border-cyan-200/90 bg-gradient-to-b from-cyan-50/60 to-white shadow-lg ring-1 ring-slate-200/80">
                  <div className="border-b border-cyan-200/80 bg-cyan-100/70 px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-sm">
                        <Settings2 className="h-4 w-4" />
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-slate-800 sm:text-lg">Configurare comandă</h2>
                        <p className="text-xs text-slate-600">Opțiuni printare, spirală și coperți</p>
                      </div>
                    </div>
                  </div>
                  <div className="p-5 sm:p-6 relative">
                    {/* Processing overlay - covers entire config area */}
                    {selectedFileId && files.some((f) => f.id === selectedFileId) && (() => {
                      const file = files.find((f) => f.id === selectedFileId)!;
                      return file.pages == null && isLoadingPages;
                    })() && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
                        <Loader2 className="h-10 w-10 animate-spin text-cyan-500" />
                        <p className="mt-3 text-sm font-medium text-slate-700">Se procesează fișierul…</p>
                        <p className="mt-1 text-xs text-slate-500 truncate max-w-[280px] px-4 text-center">
                          {files.find((f) => f.id === selectedFileId)?.name}
                        </p>
                      </div>
                    )}

                    {/* Print options for selected file */}
                    {selectedFileId && files.some((f) => f.id === selectedFileId) ? (
                      (() => {
                        const file = files.find((f) => f.id === selectedFileId)!;
                        const opts = {
                          printMode: file.printMode ?? DEFAULT_PRINT_OPTIONS.printMode,
                          duplex: file.duplex ?? DEFAULT_PRINT_OPTIONS.duplex,
                          copies: file.copies ?? DEFAULT_PRINT_OPTIONS.copies,
                        };
                        return (
                          <div key={file.id}>
                            <div className="mb-5 flex items-start gap-3">
                              <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-cyan-100 text-cyan-600">
                                <Printer className="h-5 w-5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-slate-800">Opțiuni de printare</h3>
                                <p className="truncate text-sm font-medium text-slate-600 mt-0.5" title={file.name}>{file.name}</p>
                                {file.pages != null && (
                                  <div className="mt-2 flex items-center gap-3">
                                    <span className="inline-flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-800">
                                      <FileText className="h-4 w-4 text-slate-500" />
                                      {file.pages} pagini
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-800">
                                      <CreditCard className="h-4 w-4 text-slate-500" />
                                      {calculateFilePrice(file).toFixed(2)} RON
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-5">
                              {/* Print type */}
                              <div>
                                <p className="mb-2 text-sm font-semibold text-slate-700">Tip printare</p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, printMode: "bw" } : f))}
                                    className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                                      opts.printMode === "bw"
                                        ? "bg-slate-800 text-white shadow-sm"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                                  >
                                    Alb-Negru
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, printMode: "color" } : f))}
                                    className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                                      opts.printMode === "color"
                                        ? "bg-cyan-600 text-white shadow-sm"
                                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                    }`}
                                  >
                                    Color
                                  </button>
                                </div>
                                {opts.printMode === "color" && file.colorAnalysis && (
                                  <div className="mt-2 rounded-lg bg-cyan-50 border border-cyan-200 px-3 py-2">
                                    <p className="text-xs text-slate-700 leading-relaxed">
                                      Au fost identificate:{" "}
                                      <span className="font-bold text-cyan-700">
                                        {file.colorAnalysis.colorPages} {file.colorAnalysis.colorPages === 1 ? "pagină" : "pagini"} color
                                      </span>
                                      {" "}și{" "}
                                      <span className="font-bold text-slate-800">
                                        {file.colorAnalysis.bwPages} {file.colorAnalysis.bwPages === 1 ? "pagină" : "pagini"} alb-negru
                                      </span>
                                      {" "}în document. Vei plăti preț de color doar pentru paginile efectiv colorate, restul fiind taxate la preț de alb-negru.
                                    </p>
                                  </div>
                                )}
                                {opts.printMode === "color" && file.colorAnalysis?.hasScannedPages && file.colorAnalysis.colorPages > 0 && (
                                  <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                                    <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                    <p className="text-xs text-amber-700">
                                      Documentul conține imagini scanate — {file.colorAnalysis.colorPages} pagini sunt detectate ca fiind color.
                                      Dacă documentul original este alb-negru, selectează <strong>Alb-negru</strong> pentru un preț mai bun.
                                    </p>
                                  </div>
                                )}
                              </div>

                              {/* Duplex */}
                              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 transition-colors hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  checked={opts.duplex}
                                  onChange={(e) => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, duplex: e.target.checked } : f))}
                                  className="h-4 w-4 rounded border-slate-300 text-cyan-600 focus:ring-2 focus:ring-cyan-500"
                                />
                                <span className="text-sm font-medium text-slate-700">Față-verso (Duplex)</span>
                              </label>

                              {/* Copies */}
                              <div>
                                <span className="text-sm font-semibold text-slate-700">Copii</span>
                                <div className="mt-1 flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = Math.max(1, opts.copies - 1);
                                      setFiles((prev) => {
                                        const groups = getBindingGroups(prev);
                                        const group = groups.find((g) => g.filesInGroup.some((f) => f.id === file.id));
                                        if (!group || group.filesInGroup.length === 1) {
                                          return prev.map((f) => f.id === file.id ? { ...f, copies: next } : f);
                                        }
                                        const idsInGroup = new Set(group.filesInGroup.map((f) => f.id));
                                        return prev.map((f) => idsInGroup.has(f.id) ? { ...f, copies: next } : f);
                                      });
                                    }}
                                    disabled={opts.copies <= 1}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </button>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    value={opts.copies}
                                    onChange={(e) => {
                                      const raw = Number(e.target.value) || 1;
                                      const next = Math.min(100, Math.max(1, raw));
                                      setFiles((prev) => {
                                        const groups = getBindingGroups(prev);
                                        const group = groups.find((g) => g.filesInGroup.some((f) => f.id === file.id));
                                        if (!group || group.filesInGroup.length === 1) {
                                          return prev.map((f) => f.id === file.id ? { ...f, copies: next } : f);
                                        }
                                        const idsInGroup = new Set(group.filesInGroup.map((f) => f.id));
                                        return prev.map((f) => idsInGroup.has(f.id) ? { ...f, copies: next } : f);
                                      });
                                    }}
                                    className="w-16 rounded-xl border border-slate-300 px-3 py-2 text-sm text-center focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 [appearance:textfield]"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = Math.min(100, opts.copies + 1);
                                      setFiles((prev) => {
                                        const groups = getBindingGroups(prev);
                                        const group = groups.find((g) => g.filesInGroup.some((f) => f.id === file.id));
                                        if (!group || group.filesInGroup.length === 1) {
                                          return prev.map((f) => f.id === file.id ? { ...f, copies: next } : f);
                                        }
                                        const idsInGroup = new Set(group.filesInGroup.map((f) => f.id));
                                        return prev.map((f) => idsInGroup.has(f.id) ? { ...f, copies: next } : f);
                                      });
                                    }}
                                    disabled={opts.copies >= 100}
                                    className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                          <FileText className="h-6 w-6 text-slate-400" />
                        </div>
                        <p className="text-sm font-semibold text-slate-700">Selectează un fișier din listă</p>
                        <p className="mt-1 text-xs text-slate-500">Click pe un fișier pentru a-l configura</p>
                      </div>
                    )}

                    {/* ─── Spiral / Binding options ─── */}
                    {selectedFileId && files.some((f) => f.id === selectedFileId) && (
                    <div className="mt-5 space-y-5 border-t border-slate-200 pt-5">
                      <div>
                        <p className="mb-3 text-sm font-semibold text-slate-700">
                          Finisare document
                          {selectedGroupIndex !== null && bindingGroups[selectedGroupIndex]?.filesInGroup.length > 1 && (
                            <span className="ml-2 font-normal text-slate-500 text-xs">
                              ({bindingGroups[selectedGroupIndex].filesInGroup.length} fișiere legate)
                            </span>
                          )}
                        </p>
                        {/* 2×2 Grid instead of horizontal scroll */}
                        <div className="grid grid-cols-2 gap-2">
                          {spiralOptions.map(({ value, label, icon, description }) => {
                            const isCapsareDisabled = value === "capsare" && selectedGroupSheets > MAX_CAPSARE_SHEETS;
                            return (
                              <label
                                key={value}
                                className={`flex items-center gap-3 rounded-xl border-2 p-3 transition-all duration-200 ${
                                  isCapsareDisabled
                                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60"
                                    : spiralType === value
                                    ? "cursor-pointer border-cyan-500 bg-cyan-50/90 text-cyan-700 shadow-sm ring-2 ring-cyan-500/20"
                                    : "cursor-pointer border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                }`}
                                title={isCapsareDisabled ? `Indisponibil (${selectedGroupSheets} file > ${MAX_CAPSARE_SHEETS})` : undefined}
                              >
                                <input
                                  type="radio"
                                  name="spiralType"
                                  value={value}
                                  checked={spiralType === value}
                                  disabled={isCapsareDisabled}
                                  onChange={() => {
                                    if (isCapsareDisabled) return;
                                    updateSelectedGroupOptions({ spiralType: value, ...(value !== "none" ? { spiralColor: "negru" } : {}) });
                                  }}
                                  className="sr-only"
                                />
                                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                                  isCapsareDisabled ? "text-slate-400 bg-slate-50" : spiralType === value ? "text-cyan-600 bg-cyan-100" : "text-slate-500 bg-slate-50"
                                }`}>
                                  {icon}
                                </span>
                                <div className="min-w-0">
                                  <span className="block text-sm font-semibold leading-tight">{label}</span>
                                   <span className="block text-xs text-slate-500 leading-tight mt-0.5">
                                    {isCapsareDisabled ? `Indisponibil (${selectedGroupSheets} file)` : description}
                                  </span>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Spiral color + cover options */}
                      {spiralType === "spirala" && (
                        <div className="space-y-4 rounded-xl border border-cyan-200/80 bg-cyan-50/40 p-4">
                          <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">Culoare spirală</p>
                            <div className="flex items-center gap-4">
                              {spiralColorOptions.map(({ value, label, circleClass }) => (
                                <label key={value} className="flex cursor-pointer flex-col items-center gap-1.5" title={label}>
                                  <input type="radio" name="spiralColor" value={value} checked={spiralColor === value} onChange={() => updateSelectedGroupOptions({ spiralColor: value })} className="sr-only" />
                                  <span className={`flex h-10 w-10 shrink-0 rounded-full transition-all duration-200 hover:scale-110 ${spiralColor === value ? "ring-4 ring-cyan-500 ring-offset-2" : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"} ${circleClass}`} />
                                  <span className="text-xs font-medium text-slate-600">{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="mb-1 text-sm font-medium text-slate-700">Copertă față</p>
                            <p className="text-sm text-slate-500 italic">Transparent (standard)</p>
                          </div>

                          <div>
                            <p className="mb-2 text-sm font-medium text-slate-700">Copertă spate</p>
                            <div className="flex flex-wrap items-center gap-3">
                              {coverBackColors.map(({ value, label, circleClass }) => (
                                <label key={value} className="flex cursor-pointer flex-col items-center gap-1.5" title={label}>
                                  <input type="radio" name="coverBackColor" value={value} checked={coverBackColor === value} onChange={() => updateSelectedGroupOptions({ coverBackColor: value })} className="sr-only" />
                                  <span className={`flex h-10 w-10 shrink-0 rounded-full transition-all duration-200 hover:scale-110 ${coverBackColor === value ? "ring-4 ring-cyan-500 ring-offset-2" : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"} ${circleClass}`} />
                                  <span className="text-xs font-medium text-slate-600">{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    )}
                  </div>
                </section>

                {/* Summary */}
                <section className="bg-gradient-to-br from-cyan-50/80 to-slate-50/80 p-4 ring-1 ring-slate-200/60 sm:p-5">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rezumat</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 bg-slate-100 px-3 py-2 text-base font-bold text-slate-800">
                      <FileText className="h-4 w-4 text-slate-500" />
                      {totalPages} pagini
                    </span>
                    {detectedColorPages > 0 && (
                      <>
                        <span className="inline-flex items-center gap-1.5 bg-cyan-100 px-3 py-2 text-sm font-bold text-cyan-700">
                          {detectedColorPages} color
                        </span>
                        <span className="inline-flex items-center gap-1.5 bg-slate-200 px-3 py-2 text-sm font-bold text-slate-700">
                          {detectedBwPages} alb-negru
                        </span>
                      </>
                    )}
                  </div>
                  {totalPages > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 bg-slate-100 px-3 py-2 text-base font-bold text-slate-800">
                        <CreditCard className="h-4 w-4 text-slate-500" />
                        {pagePrice.toFixed(2)}  RON printare
                      </span>
                      {spiralPrice > 0 && (
                        <span className="inline-flex items-center gap-1.5 bg-cyan-100 px-3 py-2 text-sm font-bold text-cyan-700">
                          +{spiralPrice.toFixed(2)}  RON spiralare
                        </span>
                      )}
                      {deliveryMethod !== "ridicare" && totalPrice < MIN_ORDER_LEI && totalPrice > 0 && (
                        <span className="inline-flex items-center gap-1.5 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 border border-amber-200 rounded">
                          Minim {MIN_ORDER_LEI}  RON (valoare printare: {totalPrice.toFixed(2)} RON)
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5 bg-amber-100 px-3 py-2 text-base font-bold text-amber-800">
                        {deliveryMethod === "ridicare" ? "Ridicare gratuită" : `+${SHIPPING_COST_LEI}  RON transport`}
                      </span>
                      <span className="inline-flex items-center gap-1.5 bg-slate-800 px-3 py-2 text-base font-bold text-white">
                        = {totalWithShipping.toFixed(2)}  RON total
                      </span>
                    </div>
                  )}
                  {totalPages === 0 && (
                    <div className="mt-3">
                      <span className="inline-flex items-center gap-1.5 bg-amber-100 px-3 py-2 text-sm font-bold text-amber-800">
                        Transport: {SHIPPING_COST_LEI} RON
                      </span>
                    </div>
                  )}
                  {orderSuccess && <p className="mt-1.5 text-xs font-medium text-green-700">{orderSuccess}</p>}
                  {checkoutError && !checkoutModalOpen && <p className="mt-1.5 text-xs font-medium text-red-600">{checkoutError}</p>}
                </section>
              </div>
            </div>

          </>
        )}

        {/* ─── Main CTA ─── */}
        <section className="mt-10 border-t border-slate-200/80 pt-8 pb-4">
          <div className="mx-auto max-w-2xl rounded-2xl bg-white px-6 py-6 shadow-[var(--shadow-lg)] ring-1 ring-slate-200/80 sm:px-8 sm:py-8">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                {totalPages > 0 ? (
                  <>
                    <p className="text-sm font-medium text-slate-600">Total comandă</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">{totalWithShipping.toFixed(2)} RON</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {effectivePrice.toFixed(2)}  RON printare{shippingCost > 0 ? ` + ${shippingCost}  RON transport` : " · Ridicare de la sediu (gratuit)"} · {totalPages} pagini
                    </p>
                    {detectedColorPages > 0 && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Detectat: <span className="font-semibold text-cyan-600">{detectedColorPages} pag. color</span>
                        {" · "}
                        <span className="font-semibold">{detectedBwPages} pag. alb-negru</span>
                      </p>
                    )}
                    {deliveryMethod !== "ridicare" && totalPrice > 0 && totalPrice < MIN_ORDER_LEI && (
                      <p className="mt-1 text-xs font-semibold text-amber-600">
                        ⚠ Costul real: {totalPrice.toFixed(2)} RON. Comanda minimă este de {MIN_ORDER_LEI} RON, prețul a fost ajustat automat{shippingCost > 0 ? ` (+ ${shippingCost}  RON transport)` : ""}.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-600">Adaugă fișiere PDF</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Încarcă documente pentru a vedea prețul total.
                    </p>
                  </>
                )}
              </div>
              <div className="flex flex-col items-center sm:items-end gap-2">
                {(isLoadingPages || isUploading) && (
                  <div className="flex items-center gap-2 text-cyan-700">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs font-medium">Se încarcă documentele...</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleOpenCheckout}
                  disabled={files.length === 0 || isCheckoutLoading || totalPages === 0 || isLoadingPages}
                  className="flex items-center gap-2 rounded-xl px-8 py-4 text-lg font-semibold text-white shadow-md shadow-[#00D1FF]/20 transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none" style={{ background: '#00D1FF' }}
                >
                  <CreditCard className="h-5 w-5" />
                  Finalizează comanda
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ Trust Badges ═══ */}
        <div className="mt-12 mx-auto max-w-3xl">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50">
                <Lock className="h-5 w-5 text-cyan-600" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Plată securizată</span>
              <span className="text-[10px] text-slate-500">100% criptat via Stripe</span>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50">
                <Truck className="h-5 w-5 text-emerald-600" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Livrare rapidă</span>
              <span className="text-[10px] text-slate-500">2-4 zile lucrătoare</span>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
                <Star className="h-5 w-5 text-amber-500" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Calitate premium</span>
              <span className="text-[10px] text-slate-500">Echipamente profesionale</span>
            </div>
            <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
                <Shield className="h-5 w-5 text-purple-600" />
              </div>
              <span className="text-xs font-semibold text-slate-700">Date protejate</span>
              <span className="text-[10px] text-slate-500">GDPR compliant</span>
            </div>
          </div>
        </div>

        {/* FAQ - always visible */}
        <div className="mx-auto max-w-2xl">
          <FAQ />
        </div>
      </div>

      {/* ═══ Sticky CTA bar on mobile ═══ */}
      {files.length > 0 && totalPages > 0 && !checkoutModalOpen && !orderSuccessDetails && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-sm px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-lg font-bold text-cyan-600 tabular-nums">{totalWithShipping.toFixed(2)} RON</p>
              <p className="text-xs text-slate-500 truncate">{totalPages} pag.{shippingCost > 0 ? ` · incl. ${shippingCost}  RON transport` : " · Ridicare gratuită"}</p>
            </div>
            <button
              type="button"
              onClick={handleOpenCheckout}
              disabled={isCheckoutLoading}
              className="flex shrink-0 items-center gap-2 bg-gradient-to-r from-cyan-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-cyan-500/20 transition-all hover:from-cyan-700 hover:to-cyan-600 disabled:opacity-50"
            >
              <CreditCard className="h-4 w-4" />
              Finalizează
            </button>
          </div>
        </div>
      )}


      {checkoutModalOpen && (
        <div className={`fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-6 backdrop-blur-sm overflow-hidden ${isCheckoutLoading || isUploading ? "pointer-events-none" : ""}`}>
          <div className={`w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200/50 sm:p-8 animate-[fade-in_0.3s_ease-out] ${isCheckoutLoading || isUploading ? "pointer-events-auto" : ""}`}>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Finalizare comandă</h2>
              {!isCheckoutLoading && !isUploading && (
                <button
                  type="button"
                  onClick={() => setCheckoutModalOpen(false)}
                  className="rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label="Închide"
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
            <div className="space-y-6 text-sm">



              {/* Order summary */}
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">Rezumat comandă</p>
                <ul className="space-y-4">
                  {bindingGroups.map((group, groupIdx) => {
                    const opts = groupOptions[groupIdx] ?? defaultGroupOpts;
                    const spiralLabel = opts.spiralType === "spirala"
                      ? `Spirală ${(opts.spiralColor ?? "negru").toLowerCase()}`
                      : spiralOptions.find((o) => o.value === opts.spiralType)?.label ?? "Fără spirală";
                    const spiralColorLabel: string | null = null;
                    const coverBackLabel = coverBackColors.find((c) => c.value === opts.coverBackColor)?.label ?? opts.coverBackColor;
                    const isSingleDoc = group.filesInGroup.length === 1;
                    return (
                      <li key={group.groupIndex} className="border-b border-slate-200 pb-4 last:border-0 last:pb-0">
                        {!isSingleDoc && (
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Volum {groupIdx + 1} — {group.filesInGroup.length} documente
                          </p>
                        )}
                        {group.filesInGroup.map((f) => {
                          const printModeLabel = (f.printMode ?? "bw") === "color" ? "Color" : "Alb-negru";
                          const duplexLabel = f.duplex ? "Da" : "Nu";
                          return (
                            <div key={f.id} className={isSingleDoc ? "" : "ml-2 border-l-2 border-slate-200 pl-3 py-2"}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-medium text-slate-800 truncate">{f.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => { setCheckoutModalOpen(false); setPreviewFileId(f.id); setPreviewFromCheckout(true); }}
                                    className="shrink-0 inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-cyan-50 hover:text-cyan-700 transition-colors"
                                    title="Preview document"
                                  >
                                    <FileText className="h-3 w-3" />
                                    Preview
                                  </button>
                                </div>
                                <span className="text-xs font-semibold text-cyan-600 tabular-nums shrink-0">{calculateFilePrice(f).toFixed(2)} RON</span>
                              </div>
                              {f.pages != null && <p className="mt-0.5 text-slate-500">{f.pages} pagini</p>}
                              <p className="mt-1 text-slate-600">
                                {printModeLabel} · Față-verso: {duplexLabel} · {f.copies} {f.copies === 1 ? "copie" : "copii"}
                              </p>
                            </div>
                          );
                        })}
                        <div className="mt-2 text-slate-600">
                          <p>
                            <span className="font-medium text-slate-700">Legare:</span> {spiralLabel}
                            {spiralColorLabel && `, ${spiralColorLabel}`}
                            {opts.spiralType === "spirala" && ` · Copertă: transparent / ${coverBackLabel}`}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal printare</span>
                    <span>{totalPrice.toFixed(2)} RON</span>
                  </div>
                  {deliveryMethod !== "ridicare" && totalPrice < MIN_ORDER_LEI && totalPrice > 0 && (
                    <div className="flex justify-between text-amber-600">
                      <span>Ajustare comandă minimă (valoare printare: {totalPrice.toFixed(2)} RON)</span>
                      <span>+{(MIN_ORDER_LEI - totalPrice).toFixed(2)} RON</span>
                    </div>
                  )}
                  <div className="flex justify-between text-slate-600">
                    <span>{deliveryMethod === "ridicare" ? "Transport (ridicare)" : "Transport (curier)"}</span>
                    <span>{shippingCost > 0 ? `${shippingCost.toFixed(2)} RON` : "GRATUIT"}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>Total</span>
                    <span>{totalWithShipping.toFixed(2)} RON</span>
                  </div>
                </div>
              </div>

              {/* Delivery method */}
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">Modalitate livrare</p>
                <div className="space-y-2">
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:bg-slate-50 ${deliveryMethod === "curier" ? "border-cyan-500 bg-cyan-50/50" : ""}`}>
                    <input type="radio" name="deliveryMethod" checked={deliveryMethod === "curier"} onChange={() => setDeliveryMethod("curier")} className="h-4 w-4 text-cyan-600" />
                    <div>
                      <span className="font-medium text-slate-800">Livrare prin curier</span>
                      <p className="text-xs text-slate-500">2-4 zile lucrătoare · {SHIPPING_COST_LEI} RON</p>
                    </div>
                  </label>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:bg-slate-50 ${deliveryMethod === "ridicare" ? "border-cyan-500 bg-cyan-50/50" : ""}`}>
                    <input type="radio" name="deliveryMethod" checked={deliveryMethod === "ridicare"} onChange={() => setDeliveryMethod("ridicare")} className="h-4 w-4 text-cyan-600" />
                    <div>
                      <span className="font-medium text-slate-800">Ridicare de la sediu</span>
                      <p className="text-xs text-slate-500">GRATUIT · {PICKUP_ADDRESS}</p>
                    </div>
                  </label>
                </div>
                {deliveryMethod === "ridicare" && (
                  <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-xs text-cyan-800 space-y-1.5">
                    <p className="font-semibold">📍 Adresa de ridicare:</p>
                    <p>{PICKUP_ADDRESS}</p>
                    <p>📱 Vei fi informat prin mesaj când documentele sunt pregătite.</p>
                    <p>⏰ Ai la dispoziție <strong>3 zile lucrătoare</strong> pentru ridicare.</p>
                    <p className="text-cyan-600 italic">Programul de ridicare va fi comunicat în mesajul de notificare.</p>
                  </div>
                )}
              </div>

              {/* Contact form */}
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">
                  {deliveryMethod === "curier" ? "Date livrare" : "Date contact"} <span className="text-red-500">*</span>
                </p>
                <div className="space-y-3">
                  {([
                    { key: "name" as const, label: "Nume complet", type: "text", placeholder: "Ex: Ion Popescu" },
                    { key: "phone" as const, label: "Telefon", type: "tel", placeholder: "Ex: 0712345678" },
                    { key: "email" as const, label: "Email", type: "email", placeholder: "email@exemplu.ro" },
                  ] as const).map(({ key, label, type, placeholder }) => (
                    <label key={key} className="block">
                      <span className="mb-1 block text-xs text-slate-500">{label} <span className="text-red-500">*</span></span>
                      <input
                        type={type}
                        required
                        value={shipping[key]}
                        onChange={(e) => {
                          setShipping((s) => ({ ...s, [key]: e.target.value }));
                          if (shippingErrors[key]) setShippingErrors((prev) => ({ ...prev, [key]: undefined }));
                        }}
                        placeholder={placeholder}
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 ${
                          shippingErrors[key] ? "border-red-400 focus:border-red-500 bg-red-50/50" : "border-slate-300 focus:border-cyan-500"
                        }`}
                      />
                      {shippingErrors[key] && <p className="mt-1 text-xs text-red-600">{shippingErrors[key]}</p>}
                    </label>
                  ))}
                  {deliveryMethod === "curier" && (
                    <label className="block">
                      <span className="mb-1 block text-xs text-slate-500">Adresă livrare <span className="text-red-500">*</span></span>
                      <textarea
                        required
                        value={shipping.address}
                        onChange={(e) => {
                          setShipping((s) => ({ ...s, address: e.target.value }));
                          if (shippingErrors.address) setShippingErrors((prev) => ({ ...prev, address: undefined }));
                        }}
                        placeholder="Strada, nr., localitate, județ, cod poștal"
                        rows={3}
                        className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/20 ${
                          shippingErrors.address ? "border-red-400 focus:border-red-500 bg-red-50/50" : "border-slate-300 focus:border-cyan-500"
                        }`}
                      />
                      {shippingErrors.address && <p className="mt-1 text-xs text-red-600">{shippingErrors.address}</p>}
                    </label>
                  )}
                </div>
              </div>

              {/* Payment method */}
              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">Modalitate plată</p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:bg-slate-50">
                    <input type="radio" name="paymentMethod" checked={paymentMethod === "stripe"} onChange={() => setPaymentMethod("stripe")} className="h-4 w-4 text-cyan-600" />
                    <div>
                      <span className="font-medium text-slate-800">Plată online (card)</span>
                      <p className="text-xs text-slate-500">Securizată prin Stripe · {totalWithShipping.toFixed(2)} RON</p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:bg-slate-50">
                    <input type="radio" name="paymentMethod" checked={paymentMethod === "ramburs"} onChange={() => setPaymentMethod("ramburs")} className="h-4 w-4 text-cyan-600" />
                    <div>
                      <span className="font-medium text-slate-800">{deliveryMethod === "ridicare" ? "Plată la ridicare" : "Plată la livrare (ramburs)"}</span>
                      <p className="text-xs text-slate-500">{deliveryMethod === "ridicare" ? "Achit la ridicarea documentelor" : "Achit la curier"} · {totalWithShipping.toFixed(2)} RON</p>
                    </div>
                  </label>
                </div>
              </div>

              {checkoutError && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{checkoutError}</div>
              )}

              {isLoadingPages && !isUploading && !isCheckoutLoading && (
                <div className="flex items-center gap-2 rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3 text-sm text-cyan-700">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Documentele se procesează, te rugăm așteaptă…</span>
                </div>
              )}

              {/* Upload progress - bottom of modal for mobile visibility */}
              <UploadProgressBar isUploading={isUploading} progress={uploadProgress} />

              <button
                type="button"
                onClick={handleSubmitCheckout}
                disabled={isCheckoutLoading || isUploading || isLoadingPages}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 py-4 text-lg font-semibold text-white shadow-md shadow-cyan-600/20 hover:bg-cyan-700 disabled:opacity-50 transition-all duration-200"
              >
                {(isCheckoutLoading || isUploading) ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CreditCard className="h-5 w-5" />
                )}
                {isUploading
                  ? "Se încarcă fișierele…"
                  : isCheckoutLoading
                  ? "Se procesează..."
                  : paymentMethod === "ramburs"
                    ? `Confirmă comanda · ${totalWithShipping.toFixed(2)} RON`
                    : `Plătește ${totalWithShipping.toFixed(2)}  RON online`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Order success (ramburs) ═══ */}
      {orderSuccessDetails && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden animate-[fade-in_0.3s_ease-out]">
            {/* Header verde */}
            <div className="bg-green-50 px-6 py-8 text-center">
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                <Check className="h-10 w-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                Comandă plasată cu succes!
              </h2>
              {orderSuccessDetails.paymentMethod === "ramburs" && (
                <div className="mt-4 rounded-xl bg-white/80 px-4 py-3 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800">
                    📞 Vei fi contactat telefonic pentru confirmarea comenzii
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {orderSuccessDetails.deliveryMethod === "ridicare"
                      ? "Plata se face la ridicarea documentelor"
                      : "Plata se face la livrare (ramburs)"}
                  </p>
                </div>
              )}
              {orderSuccessDetails.paymentMethod !== "ramburs" && (
                <p className="mt-3 text-slate-700">Plata a fost procesată cu succes.</p>
              )}
              {orderSuccessDetails.deliveryMethod === "ridicare" ? (
                <div className="mt-4 rounded-xl bg-cyan-50 border border-cyan-200 px-4 py-3 text-left">
                  <p className="text-sm font-semibold text-cyan-800">📍 Ridicare de la sediu</p>
                  <p className="mt-1 text-xs text-cyan-700">{PICKUP_ADDRESS}</p>
                  <p className="mt-1 text-xs text-cyan-700">📱 Vei fi informat prin mesaj când documentele sunt pregătite.</p>
                  <p className="mt-0.5 text-xs text-cyan-700">⏰ Ai la dispoziție <strong>3 zile lucrătoare</strong> pentru ridicare.</p>
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-white/80 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm">
                  Livrarea se face în <strong>2-4 zile lucrătoare</strong>.
                </p>
              )}
            </div>

            {/* Detalii complete */}
            <div className="px-6 py-6 space-y-5">
              <div className="rounded-xl bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Total de plată</span>
                  <span className="text-lg font-bold text-green-700">{orderSuccessDetails.totalWithShipping.toFixed(2)} RON</span>
                </div>
              </div>

              {/* Fișiere grupate */}
              {orderSuccessDetails.groups.map((group, gIdx) => (
                <div key={gIdx} className="space-y-2">
                  {orderSuccessDetails.groups.length > 1 && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Volum {gIdx + 1}
                    </p>
                  )}
                  {group.files.map((f, fIdx) => (
                    <div key={fIdx} className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
                      <Printer className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{f.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {f.pages ?? "?"} pag. · {f.printMode === "color" ? "Color" : "Alb-negru"}
                          {f.duplex ? " · Față-verso" : ""} · {f.copies} {f.copies === 1 ? "copie" : "copii"}
                        </p>
                      </div>
                    </div>
                  ))}
                  {group.spiralType && group.spiralType !== "none" && (
                    <div className="rounded-lg bg-cyan-50 px-4 py-2.5 text-sm text-cyan-800">
                      🔗 Legare: <strong className="capitalize">{group.spiralType}</strong>
                      {group.spiralType === "spirala" && group.spiralColor ? ` (${group.spiralColor})` : ""}
                    </div>
                  )}
                </div>
              ))}

              <p className="text-sm text-slate-600 text-center">
                Vei primi un email de confirmare.
              </p>

              <button
                type="button"
                onClick={() => setOrderSuccessDetails(null)}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-slate-800 py-3 text-sm font-semibold text-white hover:bg-slate-900 transition-colors"
              >
                ← Înapoi la pagina principală
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Preview modal ═══ */}
      {previewFileId && (() => {
        const file = files.find((f) => f.id === previewFileId);
        if (!file) return null;
        return (
          <div className="fixed inset-0 z-50 flex min-h-0 flex-col items-center overflow-y-auto bg-black/60 px-2 sm:px-4 py-4 sm:py-6 backdrop-blur-sm">
            <div className="flex max-h-[95vh] sm:max-h-[90vh] min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/50">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/80 px-3 sm:px-6 py-3 sm:py-4 gap-2">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="hidden sm:flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                    <FileText className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-slate-900">Preview document</p>
                    <p className="truncate text-[10px] sm:text-xs text-slate-500">{file.name} {file.pages != null && `· ${file.pages} pagini`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {previewFromCheckout && (
                    <button
                      type="button"
                      onClick={() => { setPreviewFileId(null); setPreviewFromCheckout(false); setCheckoutModalOpen(true); }}
                      className="flex items-center gap-1 sm:gap-1.5 rounded-lg bg-cyan-600 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs font-semibold text-white hover:bg-cyan-700 transition-colors"
                    >
                      <ChevronRight className="h-3 w-3 sm:h-3.5 sm:w-3.5 rotate-180" />
                      <span className="hidden xs:inline">Înapoi la</span> comandă
                    </button>
                  )}
                  <button type="button" onClick={() => { setPreviewFileId(null); setPreviewFromCheckout(false); }} className="rounded-xl p-2 sm:p-2.5 text-slate-500 hover:bg-white hover:text-slate-800" aria-label="Închide">
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-slate-50/60 p-2 sm:p-4 md:flex-row">
                <div className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white" style={{ minHeight: "400px" }}>
                  {file.previewUrl ? (
                    <>
                      {/* Desktop: iframe works fine */}
                      <iframe src={file.previewUrl + "#toolbar=1&navpanes=0"} className="hidden md:block h-full w-full rounded-xl" style={{ minHeight: "500px" }} title={`Preview ${file.name}`} />
                      {/* Mobile: use object with download fallback */}
                      <div className="md:hidden h-full w-full flex flex-col rounded-xl" style={{ minHeight: "400px" }}>
                        <object data={file.previewUrl} type="application/pdf" className="flex-1 w-full rounded-xl" style={{ minHeight: "400px" }}>
                          <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
                            <FileText className="h-12 w-12 text-slate-400" />
                            <p className="text-sm text-slate-600 font-medium">Preview-ul PDF nu este disponibil pe acest dispozitiv.</p>
                            <a href={file.previewUrl} download={file.name} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 transition-colors">
                              <FileUp className="h-4 w-4" />
                              Descarcă PDF-ul
                            </a>
                          </div>
                        </object>
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">Preview indisponibil</div>
                  )}
                </div>
                <div className="w-full shrink-0 space-y-5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:max-w-xs">
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-800">Setări fișier</p>
                    <div className="space-y-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-slate-500">Tip:</span>
                        <button type="button" onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, printMode: "bw" } : f))} className={`rounded-full px-3 py-1 text-xs font-medium ${file.printMode === "bw" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>Alb-negru</button>
                        <button type="button" onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, printMode: "color" } : f))} className={`rounded-full px-3 py-1 text-xs font-medium ${file.printMode === "color" ? "bg-cyan-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>Color</button>
                      </div>
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={file.duplex} onChange={(e) => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, duplex: e.target.checked } : f))} className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-600" />
                        <span>Față-verso</span>
                      </label>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-slate-500">Copii:</span>
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, copies: Math.max(1, (f.copies ?? 1) - 1) } : f))}
                            disabled={(file.copies ?? 1) <= 1}
                            className="rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                            aria-label="Scade copii"
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            min={1}
                            max={100}
                            value={file.copies}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^0-9]/g, "");
                              const next = val === "" ? 1 : Math.min(100, Math.max(1, parseInt(val, 10)));
                              setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, copies: next } : f));
                            }}
                            className="w-12 border border-slate-300 px-2 py-1 text-center text-xs [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onClick={() => setFiles((prev) => prev.map((f) => f.id === file.id ? { ...f, copies: Math.min(100, (f.copies ?? 1) + 1) } : f))}
                            disabled={(file.copies ?? 1) >= 100}
                            className="rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-2 py-1 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                            aria-label="Adaugă copii"
                          >
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
