"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  CheckCircle2,
  Settings2,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { getPdfPageCount, analyzePdfColors, type PdfColorAnalysis } from "@/lib/pdf-utils";

const PRICE_BW_ONE_SIDE = 0.25;
const PRICE_BW_DUPLEX = 0.35;
const PRICE_COLOR_ONE_SIDE = 1.5;
const PRICE_COLOR_DUPLEX = 2.5;
const SPIRAL_PLASTIC_UP_TO_200 = 3;
const SPIRAL_PLASTIC_OVER_200 = 5;
const SPIRAL_PAGE_THRESHOLD = 200;
const SHIPPING_COST_LEI = 15;

/** Limită mărime fișier PDF (50 MB). */
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const FILE_SIZE_ERROR_MSG = "Fișier prea mare (max 50 MB).";

/* Validări date livrare */
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;
const MIN_ADDRESS_LENGTH = 10;
const MAX_ADDRESS_LENGTH = 300;
/** Număr telefon România: 07xxxxxxxx (10 cifre), 7xxxxxxxx (9 cifre) sau +40 7xxxxxxxx (11 cifre) */
const ROMANIAN_PHONE_DIGITS = /^(0?7[0-9]{8}|407[0-9]{8})$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Nume: litere (inclusiv diacritice), spații, cratimă, apostrof */
const VALID_NAME_REGEX = /^[a-zA-ZăâîșțĂÂÎȘȚ\s\-']+$/;

type ShippingForm = { name: string; phone: string; email: string; address: string };
type ShippingErrors = Partial<Record<keyof ShippingForm, string>>;

function validateShipping(form: ShippingForm): ShippingErrors {
  const err: ShippingErrors = {};
  const name = form.name.trim();
  const phone = form.phone.trim().replace(/\s/g, "");
  const email = form.email.trim().toLowerCase();
  const address = form.address.trim();

  if (!name) {
    err.name = "Numele este obligatoriu.";
  } else if (name.length < MIN_NAME_LENGTH) {
    err.name = `Numele trebuie să aibă cel puțin ${MIN_NAME_LENGTH} caractere.`;
  } else if (name.length > MAX_NAME_LENGTH) {
    err.name = `Numele nu poate depăși ${MAX_NAME_LENGTH} caractere.`;
  } else if (!VALID_NAME_REGEX.test(name)) {
    err.name = "Numele poate conține doar litere, spații, cratimă și apostrof.";
  }

  const digitsOnly = phone.replace(/\D/g, "");
  if (!phone) {
    err.phone = "Numărul de telefon este obligatoriu.";
  } else if (!ROMANIAN_PHONE_DIGITS.test(digitsOnly)) {
    err.phone = "Introdu un număr de telefon valid (ex: 0712345678).";
  }

  if (!email) {
    err.email = "Emailul este obligatoriu.";
  } else if (!EMAIL_REGEX.test(email)) {
    err.email = "Introdu o adresă de email validă.";
  }

  if (!address) {
    err.address = "Adresa de livrare este obligatorie.";
  } else if (address.length < MIN_ADDRESS_LENGTH) {
    err.address = `Adresa trebuie să aibă cel puțin ${MIN_ADDRESS_LENGTH} caractere.`;
  } else if (address.length > MAX_ADDRESS_LENGTH) {
    err.address = `Adresa nu poate depăși ${MAX_ADDRESS_LENGTH} caractere.`;
  }

  return err;
}

type PrintMode = "color" | "bw";
type SpiralType = "none" | "plastic" | "perforare2" | "capsare";
type SpiralColorOption = "negru" | "alb" | "albastru" | "rosu";
type CoverColor = "transparent" | "alb" | "negru" | "albastru";

type OrderSuccessGroup = {
  files: { name: string; pages: number | null; printMode: string; duplex: boolean; copies: number }[];
  spiralType: SpiralType;
  spiralColor: SpiralColorOption;
  coverFrontColor: CoverColor;
  coverBackColor: CoverColor;
};

type OrderSuccessDetails = {
  paymentMethod: "stripe" | "ramburs";
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
  /** true = acest document formează împreună cu anteriorul un singur volum (set de documente legate împreună) */
  groupWithPrevious: boolean;
  /** Rezultatul analizei color per pagină (disponibil după scanare) */
  colorAnalysis?: PdfColorAnalysis;
}

const DEFAULT_PRINT_OPTIONS = {
  printMode: "bw" as PrintMode,
  duplex: false,
  copies: 1,
};

/** Împarte fișierele în grupuri de legare: fiecare grup = un document separat sau mai multe fișiere într-un singur volum (set legat împreună). */
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

export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [shipping, setShipping] = useState<ShippingForm>({
    name: "",
    phone: "",
    email: "",
    address: "",
  });
  const [shippingErrors, setShippingErrors] = useState<ShippingErrors>({});
  const [paymentMethod, setPaymentMethod] = useState<"stripe" | "ramburs">("stripe");
  const [orderSuccess, setOrderSuccess] = useState<string | null>(null);
  const [orderSuccessDetails, setOrderSuccessDetails] = useState<OrderSuccessDetails | null>(null);
  const [scrollToFileId, setScrollToFileId] = useState<string | null>(null);

  const defaultGroupOpts = {
    spiralType: "none" as SpiralType,
    spiralColor: "negru" as SpiralColorOption,
    coverFrontColor: "transparent" as CoverColor,
    coverBackColor: "transparent" as CoverColor,
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
  const coverFrontColor = selectedGroupIndex !== null ? (groupOptions[selectedGroupIndex] ?? defaultGroupOpts).coverFrontColor : defaultGroupOpts.coverFrontColor;
  const coverBackColor = selectedGroupIndex !== null ? (groupOptions[selectedGroupIndex] ?? defaultGroupOpts).coverBackColor : defaultGroupOpts.coverBackColor;

  const updateSelectedGroupOptions = useCallback((patch: Partial<typeof defaultGroupOpts>) => {
    if (selectedGroupIndex === null) return;
    setGroupOptions((prev) => ({
      ...prev,
      [selectedGroupIndex]: { ...defaultGroupOpts, ...prev[selectedGroupIndex], ...patch },
    }));
  }, [selectedGroupIndex]);

  const loadPageCounts = useCallback(async (newFiles: UploadedFile[]) => {
    setIsLoadingPages(true);
    const updated = await Promise.all(
      newFiles.map(async (item) => {
        if (item.pages != null) return item;
        try {
          const colorAnalysis = await analyzePdfColors(item.file);
          return {
            ...item,
            pages: colorAnalysis.totalPages,
            colorAnalysis,
          };
        } catch {
          // Fallback: try just counting pages
          try {
            const pages = await getPdfPageCount(item.file);
            return { ...item, pages };
          } catch {
            return { ...item, pages: null, error: "Nu s-a putut citi PDF-ul" };
          }
        }
      })
    );
    setFiles((prev) =>
      prev.map((f) => {
        const loaded = updated.find((u) => u.id === f.id);
        if (!loaded) return f;
        return {
          ...f,
          pages: loaded.pages ?? f.pages,
          error: loaded.error ?? f.error,
          colorAnalysis: loaded.colorAnalysis ?? f.colorAnalysis,
        };
      })
    );
    setIsLoadingPages(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const dropped = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "application/pdf"
      );
      if (dropped.length === 0) return;
      const newItems: UploadedFile[] = dropped.map((file) => {
        const tooBig = file.size > MAX_FILE_SIZE_BYTES;
        return {
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          name: file.name,
          pages: null,
          error: tooBig ? FILE_SIZE_ERROR_MSG : undefined,
          printMode: "bw" as PrintMode,
          duplex: false,
          copies: 1,
          previewUrl: URL.createObjectURL(file),
          groupWithPrevious: false,
        };
      });
      setFiles((prev) => {
        const next = [...prev, ...newItems];
        if (prev.length === 0 && newItems.length > 0) {
          setSelectedFileId(newItems[0].id);
        }
        return next;
      });
      loadPageCounts([...files, ...newItems]);
    },
    [files, loadPageCounts]
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (!selected?.length) return;
      const newItems: UploadedFile[] = Array.from(selected).map((file) => {
        const tooBig = file.size > MAX_FILE_SIZE_BYTES;
        return {
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          name: file.name,
          pages: null,
          error: tooBig ? FILE_SIZE_ERROR_MSG : undefined,
          printMode: "bw" as PrintMode,
          duplex: false,
          copies: 1,
          previewUrl: URL.createObjectURL(file),
          groupWithPrevious: false,
        };
      });
      setFiles((prev) => {
        const next = [...prev, ...newItems];
        if (prev.length === 0 && newItems.length > 0) {
          setSelectedFileId(newItems[0].id);
        }
        return next;
      });
      loadPageCounts([...files, ...newItems]);
      e.target.value = "";
    },
    [files, loadPageCounts]
  );

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const toRemove = prev.find((f) => f.id === id);
      if (toRemove?.previewUrl) {
        URL.revokeObjectURL(toRemove.previewUrl);
      }
      const next = prev.filter((f) => f.id !== id);
      if (selectedFileId === id) {
        setSelectedFileId(next.length > 0 ? next[0].id : null);
      }
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
      const upGroupWithPrevious =
        i - 1 === 0 ? false : next[i - 2].groupWithPrevious === true;
      const downGroupWithPrevious = wasFirstInGroup
        ? false
        : upGroupWithPrevious;
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
      const wasLastInGroup =
        prev[i].groupWithPrevious === true &&
        (i === prev.length - 1 || prev[i + 1].groupWithPrevious === false);
      const next = [...prev];
      [next[i], next[i + 1]] = [{ ...prev[i + 1] }, { ...prev[i] }];
      const upGroupWithPrevious =
        i === 0 ? false : next[i - 1].groupWithPrevious === true;
      const downGroupWithPrevious = wasLastInGroup ? false : upGroupWithPrevious;
      next[i] = { ...next[i], groupWithPrevious: upGroupWithPrevious };
      next[i + 1] = { ...next[i + 1], groupWithPrevious: downGroupWithPrevious };
      return next;
    });
    setScrollToFileId(id);
  };

  // După reordonare, aduce documentul mutat în view în cadrul listei
  useEffect(() => {
    if (!scrollToFileId) return;
    const timer = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-file-id="${scrollToFileId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      setScrollToFileId(null);
    });
    return () => cancelAnimationFrame(timer);
  }, [scrollToFileId]);

  const totalPages = files.reduce(
    (sum, f) => sum + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
    0
  );

  // Calcul pagini color detectate automat (din analiza PDF) — doar pentru fișierele setate pe Color
  const detectedColorPages = files.reduce((sum, f) => {
    if (f.pages == null) return sum;
    const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
    const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
    if (mode === "color" && f.colorAnalysis) {
      return sum + f.colorAnalysis.colorPages * copies;
    }
    return sum;
  }, 0);

  const detectedBwPages = files.reduce((sum, f) => {
    if (f.pages == null) return sum;
    const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
    const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;
    if (mode === "color" && f.colorAnalysis) {
      return sum + f.colorAnalysis.bwPages * copies;
    }
    if (mode === "bw") {
      return sum + f.pages * copies;
    }
    // color mode without analysis → treat all as color (0 bw)
    return sum;
  }, 0);

  // Pagini color pe baza opțiunii alese de utilizator (printMode === "color")
  const userChosenColorPages = files.reduce(
    (sum, f) =>
      sum +
      (f.pages != null && (f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode) === "color"
        ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies)
        : 0),
    0
  );

  /**
   * Calcul preț per pagină — când modul este "color" și avem analiza PDF,
   * aplicăm preț color doar paginilor detectate ca fiind color,
   * iar paginile alb-negru din același document se taxează la tarif A/N.
   */
  const pagePrice = files.reduce((sum, f) => {
    if (f.pages == null) return sum;
    const mode = f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode;
    const duplex = f.duplex ?? DEFAULT_PRINT_OPTIONS.duplex;
    const copies = f.copies ?? DEFAULT_PRINT_OPTIONS.copies;

    if (mode === "bw") {
      // Toate paginile sunt A/N
      const sides = f.pages * copies;
      if (duplex) {
        return sum + Math.ceil(sides / 2) * PRICE_BW_DUPLEX;
      }
      return sum + sides * PRICE_BW_ONE_SIDE;
    }

    // mode === "color" — folosim detecția automată dacă e disponibilă
    if (f.colorAnalysis) {
      const colorSides = f.colorAnalysis.colorPages * copies;
      const bwSides = f.colorAnalysis.bwPages * copies;
      if (duplex) {
        // Aproximare: paginile color se taxează la preț color, cele A/N la preț A/N
        // (pe fiecare foaie se va printa la tariful cel mai mare al paginilor de pe foaie,
        //  dar folosim o aproximare per pagină pentru simplitate)
        const colorSheets = Math.ceil(colorSides / 2);
        const bwSheets = Math.ceil(bwSides / 2);
        return sum + colorSheets * PRICE_COLOR_DUPLEX + bwSheets * PRICE_BW_DUPLEX;
      }
      return sum + colorSides * PRICE_COLOR_ONE_SIDE + bwSides * PRICE_BW_ONE_SIDE;
    }

    // Fără analiza color → toate paginile la tarif color (fallback)
    const sides = f.pages * copies;
    if (duplex) {
      return sum + Math.ceil(sides / 2) * PRICE_COLOR_DUPLEX;
    }
    return sum + sides * PRICE_COLOR_ONE_SIDE;
  }, 0);
  const spiralPrice = useMemo(() => {
    let sum = 0;
    bindingGroups.forEach((grp, groupIndex) => {
      const groupPages = grp.filesInGroup.reduce(
        (s, f) => s + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
        0
      );
      const opts = groupOptions[groupIndex] ?? defaultGroupOpts;
      if (groupPages > 0 && opts.spiralType === "plastic") {
        sum += groupPages <= SPIRAL_PAGE_THRESHOLD ? SPIRAL_PLASTIC_UP_TO_200 : SPIRAL_PLASTIC_OVER_200;
      }
    });
    return sum;
  }, [bindingGroups, groupOptions]);
  const totalPrice = pagePrice + spiralPrice;
  const totalWithShipping = totalPrice + SHIPPING_COST_LEI;

  const coverColors: {
    value: CoverColor;
    label: string;
    circleClass: string;
  }[] = [
    {
      value: "transparent",
      label: "Fără copertă",
      circleClass: "bg-slate-100 border-2 border-dashed border-slate-300",
    },
    {
      value: "alb",
      label: "Alb",
      circleClass: "bg-white border border-slate-200 shadow-inner",
    },
    { value: "negru", label: "Negru", circleClass: "bg-slate-800" },
    { value: "albastru", label: "Albastru", circleClass: "bg-blue-500" },
  ];

  const spiralColorOptions: {
    value: SpiralColorOption;
    label: string;
    circleClass: string;
  }[] = [
    { value: "negru", label: "Negru", circleClass: "bg-slate-800" },
    { value: "alb", label: "Alb", circleClass: "bg-white border border-slate-200 shadow-inner" },
    { value: "albastru", label: "Albastru", circleClass: "bg-blue-500" },
    { value: "rosu", label: "Roșu", circleClass: "bg-red-500" },
  ];

  const selectedGroupPages =
    selectedGroupIndex !== null
      ? bindingGroups[selectedGroupIndex].filesInGroup.reduce(
          (s, f) => s + (f.pages != null ? f.pages * (f.copies ?? DEFAULT_PRINT_OPTIONS.copies) : 0),
          0
        )
      : totalPages;
  const spiralOptions: { value: SpiralType; label: string; icon: React.ReactNode; description: string }[] = [
    { value: "none", label: "Doar print", icon: <BookOpen className="h-8 w-8" />, description: "Fără legare, doar printare" },
    { value: "plastic", label: "Spiralare", icon: <Circle className="h-8 w-8" />, description: selectedGroupPages <= SPIRAL_PAGE_THRESHOLD ? "3 lei" : "5 lei" },
    { value: "perforare2", label: "Perforare 2 găuri", icon: <BookMarked className="h-8 w-8" />, description: "Perforare dosar cu 2 găuri" },
    { value: "capsare", label: "Capsare (max 240 coli)", icon: <CheckCircle2 className="h-8 w-8" />, description: "Capsare colț / lateral (maxim 240 coli)" },
  ];

  const handleOpenCheckout = () => {
    setCheckoutError(null);
    setOrderSuccess(null);
    setCheckoutModalOpen(true);
  };

  const handleSubmitCheckout = async () => {
    const errors = validateShipping(shipping);
    if (Object.keys(errors).length > 0) {
      setShippingErrors(errors);
      setCheckoutError("Completează corect toate câmpurile obligatorii pentru livrare.");
      return;
    }
    setShippingErrors({});
    setCheckoutError(null);
    setIsCheckoutLoading(true);
    const { name, phone, email, address } = shipping;
    try {
      const validFiles = files.filter((f) => !f.error);
      if (validFiles.length === 0) {
        setCheckoutError("Adaugă fișiere PDF valide (max 50 MB per fișier).");
        setIsCheckoutLoading(false);
        return;
      }
      // Încarcă fișierele pentru orice metodă de plată (pentru salvare comandă)
      const fileList = validFiles.map((f) => f.file);
      let fileUrls: string[] = [];
      if (fileList.length > 0) {
        setIsUploading(true);
        try {
          const formData = new FormData();
          fileList.forEach((file) => formData.append("files", file));
          const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) throw new Error(uploadData.error ?? "Eroare la încărcare");
          fileUrls = uploadData.urls ?? [];
        } finally {
          setIsUploading(false);
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
          coverFrontColor: opts.coverFrontColor,
          coverBackColor: opts.coverBackColor,
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
        coverFrontColor: validBindingOptions[0]?.coverFrontColor ?? "transparent",
        coverBackColor: validBindingOptions[0]?.coverBackColor ?? "transparent",
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
          config_details,
        }),
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error ?? "Eroare la salvare comanda.");

      if (paymentMethod === "ramburs") {
        setOrderSuccessDetails({
          paymentMethod: "ramburs",
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
              coverFrontColor: opts.coverFrontColor,
              coverBackColor: opts.coverBackColor,
            };
          }),
          totalPages,
          totalPrice,
          totalWithShipping,
        });
        setCheckoutModalOpen(false);
        setFiles([]);
        setSelectedFileId(null);
        return;
      }

      const fileUrlMeta: Record<string, string> = {};
      fileUrls.forEach((url, i) => {
        fileUrlMeta[`file_url_${i}`] = url;
      });
      const coverColorSummary =
        coverFrontColor === "transparent" && coverBackColor === "transparent"
          ? ""
          : `fata:${coverFrontColor};spate:${coverBackColor}`;
      const amountBani = Math.round(totalWithShipping * 100);
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountBani,
          currency: "ron",
          metadata: {
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Eroare la plată");
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Nu s-a primit link de plată");
      }
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "Eroare la plată");
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50/80">
      <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        {/* Titlu + subtitlu + listă prețuri pe 2 rânduri, doar în spațiul din dreapta titlului */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6">
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
              <Printer className="h-4 w-4" />
              Rapid · Sigur · Stripe
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Printare online
            </h1>
            <p className="mt-2 text-base text-slate-600 sm:text-lg">
              Încarcă PDF-urile, configurează opțiunile și plătește în siguranță.
            </p>
          </div>
          {/* Listă prețuri – exact 2 rânduri (4 coloane), înălțime ≤ titlu, doar spațiul după titlu */}
          <section className="shrink-0 w-full max-w-full rounded-2xl border border-slate-200/80 bg-white shadow-sm lg:max-h-[11rem] lg:w-auto lg:self-start">
            <div className="flex flex-col lg:max-h-[11rem]">
              <div className="shrink-0 bg-slate-50/80 px-3 py-2 border-b border-slate-200/80">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-600 sm:text-sm">Prețuri</p>
              </div>
              <div className="shrink-0">
                <div className="grid grid-cols-3 gap-1.5 p-2 text-xs sm:gap-2 sm:p-2.5 sm:text-sm">
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate" title="Alb-negru o față">Alb-negru o față</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{PRICE_BW_ONE_SIDE} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate" title="Alb-negru față-verso">Alb-negru față-verso</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{PRICE_BW_DUPLEX} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">Color o față</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{PRICE_COLOR_ONE_SIDE} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">Color față-verso</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{PRICE_COLOR_DUPLEX} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">Plast. ≤{SPIRAL_PAGE_THRESHOLD}</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{SPIRAL_PLASTIC_UP_TO_200} lei</p>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-1.5 py-1 sm:px-2 sm:py-1.5">
                    <p className="text-slate-600 leading-tight truncate">Plast. &gt;{SPIRAL_PAGE_THRESHOLD}</p>
                    <p className="mt-0.5 font-semibold text-slate-800 tabular-nums">{SPIRAL_PLASTIC_OVER_200} lei</p>
                  </div>
                  {/* Opțiunea metalică a fost eliminată din ofertă */}
                </div>
              </div>
            </div>
          </section>
        </header>

        {files.length === 0 ? (
          <div className="mt-5 mx-auto w-full">
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`drop-zone flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 lg:min-h-[260px] ${
                isDragging
                  ? "border-blue-500 bg-blue-50/90 shadow-inner"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-[var(--shadow)]"
              }`}
            >
              <input
                type="file"
                accept="application/pdf"
                multiple
                onChange={onFileInput}
                className="hidden"
              />
              <FileUp className={`drop-zone-icon mb-3 h-12 w-12 sm:h-14 sm:w-14 ${isDragging ? "text-blue-500" : "text-slate-400"}`} />
              <p className="text-center text-slate-600 text-sm sm:text-base">
                Trage fișiere PDF aici sau{" "}
                <span className="font-semibold text-blue-600 underline decoration-blue-600/30 underline-offset-2">
                  click pentru a selecta
                </span>
              </p>
              <p className="mt-1.5 text-xs text-slate-500 sm:text-sm">
                Acceptă mai multe fișiere · Doar PDF · Max 50 MB per fișier
              </p>
            </label>
          </div>
        ) : (
        <div className="mt-5 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,440px)_1fr] lg:gap-10">
          {/* Stânga: listă fișiere (îngustă ca dreapta să aibă spațiu pentru configurare) */}
          <div className="flex min-h-0 flex-col">
            <section className="mt-0 flex min-h-0 flex-1 flex-col">
                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={onDrop}
                  className={`drop-zone mb-6 flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-200 lg:min-h-[260px] ${
                    isDragging
                      ? "border-blue-500 bg-blue-50/90 shadow-inner"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-[var(--shadow)]"
                  }`}
                >
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={onFileInput}
                    className="hidden"
                  />
                  <FileUp className={`drop-zone-icon mb-3 h-12 w-12 sm:h-14 sm:w-14 ${isDragging ? "text-blue-500" : "text-slate-400"}`} />
                  <p className="text-center text-slate-600 text-sm sm:text-base">
                    Trage fișiere PDF aici sau{" "}
                    <span className="font-semibold text-blue-600 underline decoration-blue-600/30 underline-offset-2">
                      click pentru a selecta
                    </span>
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500 sm:text-sm">
                    Acceptă mai multe fișiere · Doar PDF · Max 50 MB per fișier
                  </p>
                </label>
                <h2 className="mb-3 flex shrink-0 items-center gap-2 text-base font-semibold text-slate-800">
                  <FileText className="h-5 w-5 text-blue-600" />
                  Fișiere încărcate
                  <span className="ml-2 rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                    {files.length}
                  </span>
                </h2>
                <div className="min-h-0 overflow-x-hidden overflow-y-auto rounded-xl border-2 border-slate-200 bg-slate-50/50 pr-1 shadow-inner" style={{ maxHeight: "min(70vh, 560px)" }}>
                <ul className="space-y-3 py-1">
                  {bindingGroups.map((group, groupIndex) => {
                    const startIndex = bindingGroups.slice(0, groupIndex).reduce((acc, g) => acc + g.filesInGroup.length, 0);
                    const isBinding = group.filesInGroup.length > 1;

                    const renderFileRow = (item: UploadedFile, index: number) => {
                      const globalIndex = startIndex + index;
                      return (
                        <div
                          key={item.id}
                          data-file-id={item.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setSelectedFileId(item.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedFileId(item.id);
                            }
                          }}
                          className={`file-list-item flex items-center gap-3 px-4 py-3.5 transition-all duration-200 ${
                            isBinding ? "border-l-4 border-blue-400 bg-white" : ""
                          } ${
                            selectedFileId === item.id
                              ? "ring-2 ring-blue-500 ring-offset-2 bg-white shadow-[var(--shadow)]"
                              : "bg-white shadow-[var(--shadow)] ring-1 ring-slate-200/80 hover:ring-slate-300 hover:shadow-[var(--shadow-md)]"
                          } ${isBinding && index > 0 ? "border-t border-blue-200/60 rounded-none ring-0 shadow-none" : "rounded-xl"} ${!isBinding ? "rounded-xl" : index === 0 ? "rounded-t-lg" : index === group.filesInGroup.length - 1 ? "rounded-b-lg" : ""}`}
                          style={{ animationDelay: `${globalIndex * 60}ms` }}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                            <FileText className="h-5 w-5 text-slate-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-800">
                              {item.name}
                            </p>
                            <p className="text-sm text-slate-500">
                              {item.pages != null ? (
                                <span>
                                  {item.pages} pagini · {(item.copies ?? DEFAULT_PRINT_OPTIONS.copies)} copie
                                  {(item.copies ?? 1) > 1 ? "i" : ""} ·{" "}
                                  {(item.printMode ?? DEFAULT_PRINT_OPTIONS.printMode) === "color" ? "Color" : "Alb-negru"}
                                  {(item.duplex ?? DEFAULT_PRINT_OPTIONS.duplex) ? " · Față-verso" : ""}
                                  {(item.printMode ?? DEFAULT_PRINT_OPTIONS.printMode) === "color" && item.colorAnalysis && (
                                    <span className="block text-xs text-slate-400 mt-0.5">
                                      Detectat: {item.colorAnalysis.colorPages} color, {item.colorAnalysis.bwPages} alb-negru
                                    </span>
                                  )}
                                </span>
                              ) : item.error ? (
                                <span className="text-red-600">{item.error}</span>
                              ) : (
                                <span className="flex items-center gap-1">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Se numără paginile…
                                </span>
                              )}
                            </p>
                            {globalIndex >= 1 && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                    item.groupWithPrevious
                                      ? "bg-blue-100 text-blue-800 border border-blue-200"
                                      : "bg-slate-100 text-slate-700 border border-slate-200"
                                  }`}
                                >
                                  {item.groupWithPrevious ? "În același volum (set legat împreună)" : "Volum separat"}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFiles((prev) =>
                                      prev.map((f, i) =>
                                        i === globalIndex
                                          ? { ...f, groupWithPrevious: !item.groupWithPrevious }
                                          : f
                                      )
                                    );
                                  }}
                                  className="text-[11px] font-medium text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                  {item.groupWithPrevious
                                    ? "Separă de volumul de deasupra"
                                    : "Unește cu volumul de deasupra"}
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); moveFileUp(item.id); }}
                                disabled={globalIndex === 0}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
                                aria-label="Mută sus"
                              >
                                <ChevronUp className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); moveFileDown(item.id); }}
                                disabled={globalIndex === files.length - 1}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
                                aria-label="Mută jos"
                              >
                                <ChevronDown className="h-4 w-4" />
                              </button>
                            </div>
                            {item.previewUrl && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewFileId(item.id);
                                }}
                                className="rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                              >
                                Preview
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFile(item.id);
                              }}
                              className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              aria-label="Șterge fișier"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      );
                    };

                    if (group.filesInGroup.length === 1) {
                      return (
                        <li key={`group-${groupIndex}`} className="list-none">
                          {renderFileRow(group.filesInGroup[0], 0)}
                        </li>
                      );
                    }

                    return (
                      <li key={`group-${groupIndex}`} className="list-none">
                        <div className="rounded-xl border-2 border-blue-200/80 bg-blue-50/50 overflow-hidden shadow-sm">
                          <div className="flex items-center gap-2 px-3 py-2 bg-blue-100/70 border-b border-blue-200/60">
                            <BookMarked className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="text-sm font-semibold text-blue-800">
                              Volum (set de documente legate) · {group.filesInGroup.length} fișiere
                            </span>
                          </div>
                          <div className="p-2 space-y-0">
                            {group.filesInGroup.map((item, idx) => renderFileRow(item, idx))}
                          </div>
                        </div>
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
                {files.length > 1 && (
                  <p className="mt-3 text-xs text-slate-500">
                    Bifează „Împreună cu documentul anterior” pentru documente care formează o singură îndosariere. Folosește ↑/↓ pentru ordine.
                  </p>
                )}
              </section>
          </div>

          {/* Dreapta: configurare evidentă */}
          <div className="lg:sticky lg:top-8 lg:self-start space-y-5">
        <section className="overflow-hidden rounded-2xl border-2 border-blue-200/90 bg-gradient-to-b from-blue-50/60 to-white shadow-lg ring-1 ring-slate-200/80 sm:border-blue-200 sm:shadow-xl">
          <div className="border-b border-blue-200/80 bg-blue-100/70 px-5 py-4 sm:px-6 sm:py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                <Settings2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-800 sm:text-xl">Configurare comandă</h2>
                <p className="text-xs text-slate-600 sm:text-sm">Opțiuni printare, spirală și coperți</p>
              </div>
            </div>
          </div>
          <div className="p-6 sm:p-8">
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
                  <div className="mb-5 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                      <Printer className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold text-slate-800">
                        Opțiuni de printare
                      </h2>
                      <p className="truncate text-sm font-medium text-slate-700" title={file.name}>
                        {file.name}
                      </p>
                      {file.pages != null && (
                        <div className="text-xs text-slate-500 space-y-0.5">
                          <p>{file.pages} pagini</p>
                          {opts.printMode === "color" && file.colorAnalysis && (
                            <p className="text-xs">
                              Detectat automat:{" "}
                              <span className="font-semibold text-blue-600">{file.colorAnalysis.colorPages}</span> pagini color,{" "}
                              <span className="font-semibold text-slate-700">{file.colorAnalysis.bwPages}</span> pagini alb-negru
                            </p>
                          )}
                          {opts.printMode === "color" && !file.colorAnalysis && (
                            <p className="text-xs text-amber-600">
                              Analiza color nu este disponibilă — toate paginile se taxează ca fiind color.
                            </p>
                          )}
                        </div>
                      )}
                      <p className="mt-1.5 text-xs text-slate-400">
                        Modificările se aplică <strong>doar acestui document</strong>. Celelalte fișiere nu sunt afectate.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <p className="mb-2 text-sm font-semibold text-slate-700">
                        Tip printare
                      </p>
                      <p className="text-xs text-slate-500">
                        Alb-negru: 0,25 / 0,35 lei · Color: 1,5 / 2,5 lei
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Când alegi <span className="font-semibold">Color</span>, fiecare pagină este scanată automat.
                        Paginile alb-negru din document se taxează la tariful A/N.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((prev) =>
                              prev.map((f) =>
                                f.id === file.id ? { ...f, printMode: "bw" } : f
                              )
                            )
                          }
                          className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                            opts.printMode === "bw"
                              ? "bg-slate-800 text-white shadow-sm"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          Alb-Negru
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((prev) =>
                              prev.map((f) =>
                                f.id === file.id
                                  ? { ...f, printMode: "color" }
                                  : f
                              )
                            )
                          }
                          className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-colors ${
                            opts.printMode === "color"
                              ? "bg-blue-600 text-white shadow-sm"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          Color
                        </button>
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 transition-colors hover:bg-slate-50">
                      <input
                        type="checkbox"
                        checked={opts.duplex}
                        onChange={(e) =>
                          setFiles((prev) =>
                            prev.map((f) =>
                              f.id === file.id
                                ? { ...f, duplex: e.target.checked }
                                : f
                            )
                          )
                        }
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-slate-700">Față-verso (Duplex)</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-700">
                        Copii
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={50}
                        value={opts.copies}
                        onChange={(e) => {
                          const raw = Number(e.target.value) || 1;
                          const next = Math.min(50, Math.max(1, raw));
                          setFiles((prev) => {
                            const groups = getBindingGroups(prev);
                            const group = groups.find((g) =>
                              g.filesInGroup.some((f) => f.id === file.id)
                            );
                            // Dacă nu e grup sau este un singur fișier, aplicăm doar pe acel document
                            if (!group || group.filesInGroup.length === 1) {
                              return prev.map((f) =>
                                f.id === file.id ? { ...f, copies: next } : f
                              );
                            }
                            const idsInGroup = new Set(
                              group.filesInGroup.map((f) => f.id)
                            );
                            // Pentru documente într-un volum (set legat împreună), numărul de copii este per grup
                            return prev.map((f) =>
                              idsInGroup.has(f.id) ? { ...f, copies: next } : f
                            );
                          });
                        }}
                        className="w-20 rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>
                  </div>
                </div>
              );
            })()
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <FileText className="h-6 w-6 text-slate-400" />
              </div>
              <p className="text-sm font-semibold text-slate-700">
                Selectează un fișier din listă
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Click pe un fișier pentru a edita tipul de printare, copii și față-verso
              </p>
            </div>
          )}

          <div className="mt-6 space-y-6 border-t border-slate-200 pt-6">
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">
                Spirală
                {selectedGroupIndex !== null && bindingGroups[selectedGroupIndex]?.filesInGroup.length > 1 && (
                  <span className="ml-2 font-normal text-slate-500">
                    (acest volum: {bindingGroups[selectedGroupIndex].filesInGroup.length} fișiere legate împreună)
                  </span>
                )}
              </p>
              <div className="flex gap-2 sm:gap-3 overflow-x-auto pb-1">
                {spiralOptions.map(({ value, label, icon, description }) => (
                  <label
                    key={value}
                    className={`min-w-[150px] flex-1 sm:flex-none flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all duration-200 sm:p-4 ${
                      spiralType === value
                        ? "border-blue-500 bg-blue-50/90 text-blue-700 shadow-sm ring-2 ring-blue-500/20"
                        : "border-slate-200 bg-slate-50/50 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="spiralType"
                      value={value}
                      checked={spiralType === value}
                      onChange={() => {
                        updateSelectedGroupOptions({
                          spiralType: value,
                          ...(value !== "none" ? { spiralColor: "negru" } : {}),
                        });
                      }}
                      className="sr-only"
                    />
                    <span
                      className={`flex h-12 w-12 items-center justify-center ${
                        spiralType === value ? "text-blue-600" : "text-slate-500"
                      }`}
                    >
                      {icon}
                    </span>
                    <span className="text-center font-medium">{label}</span>
                    <span className="text-xs text-slate-500">
                      {description}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {spiralType === "plastic" && (
              <div className="space-y-4">
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    Culoare spirală
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    {spiralColorOptions.map(({ value, label, circleClass }) => (
                      <label
                        key={value}
                        className="flex cursor-pointer flex-col items-center gap-2"
                        title={label}
                      >
                        <input
                          type="radio"
                          name="spiralColor"
                          value={value}
                          checked={spiralColor === value}
                          onChange={() => updateSelectedGroupOptions({ spiralColor: value })}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-11 w-11 shrink-0 rounded-full transition-all duration-200 hover:scale-110 ${
                            spiralColor === value
                              ? "ring-4 ring-blue-500 ring-offset-2"
                              : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"
                          } ${circleClass}`}
                        />
                        <span className="text-xs font-medium text-slate-600">
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    Copertă față
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    {coverColors.map(({ value, label, circleClass }) => (
                      <label
                        key={value}
                        className="flex cursor-pointer flex-col items-center gap-2"
                        title={label}
                      >
                        <input
                          type="radio"
                          name="coverFrontColor"
                          value={value}
                          checked={coverFrontColor === value}
                          onChange={() => updateSelectedGroupOptions({ coverFrontColor: value })}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-11 w-11 shrink-0 rounded-full transition-all duration-200 hover:scale-110 ${
                            coverFrontColor === value
                              ? "ring-4 ring-blue-500 ring-offset-2"
                              : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"
                          } ${circleClass}`}
                        />
                        <span className="text-xs font-medium text-slate-600">
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-slate-700">
                    Copertă spate
                  </p>
                  <div className="flex flex-wrap items-center gap-4">
                    {coverColors.map(({ value, label, circleClass }) => (
                      <label
                        key={value}
                        className="flex cursor-pointer flex-col items-center gap-2"
                        title={label}
                      >
                        <input
                          type="radio"
                          name="coverBackColor"
                          value={value}
                          checked={coverBackColor === value}
                          onChange={() => updateSelectedGroupOptions({ coverBackColor: value })}
                          className="sr-only"
                        />
                        <span
                          className={`flex h-11 w-11 shrink-0 rounded-full transition-all duration-200 hover:scale-110 ${
                            coverBackColor === value
                              ? "ring-4 ring-blue-500 ring-offset-2"
                              : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"
                          } ${circleClass}`}
                        />
                        <span className="text-xs font-medium text-slate-600">
                          {label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        </section>

        {/* Rezumat – sub opțiunile de printare și legare */}
        <section className="rounded-2xl bg-gradient-to-br from-blue-50/80 to-slate-50/80 p-4 ring-1 ring-slate-200/60 sm:p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rezumat</p>
          <p className="mt-1 text-sm text-slate-700">
            <span className="font-semibold text-slate-800">{totalPages}</span> pagini
            {totalPages > 0 ? (
              <>
                <span className="mx-1.5 text-slate-400">·</span>
                <span className="font-semibold text-blue-600">{totalPrice.toFixed(2)} lei</span> printare
                <span className="mx-1.5 text-slate-400">·</span>
                <span className="font-semibold text-slate-800">{totalWithShipping.toFixed(2)} lei</span> total (inclus {SHIPPING_COST_LEI} lei transport)
              </>
            ) : (
              <>
                <span className="mx-1.5 text-slate-400">·</span>
                <span className="text-slate-500">Transport: {SHIPPING_COST_LEI} lei (se adaugă la comandă)</span>
              </>
            )}
          </p>
          {/* Breakdown pagini color vs A/N detectate */}
          {detectedColorPages > 0 && (
            <p className="mt-1.5 text-xs text-slate-600">
              Pagini detectate automat:{" "}
              <span className="font-semibold text-blue-600">{detectedColorPages} color</span>
              <span className="mx-1 text-slate-400">·</span>
              <span className="font-semibold text-slate-700">{detectedBwPages} alb-negru</span>
              <span className="ml-1 text-slate-400">(prețul reflectă tipul real al fiecărei pagini)</span>
            </p>
          )}
          {orderSuccess && <p className="mt-1.5 text-xs font-medium text-green-700">{orderSuccess}</p>}
          {checkoutError && <p className="mt-1.5 text-xs font-medium text-red-600">{checkoutError}</p>}
        </section>
          </div>
        </div>
        )}

        {/* Buton principal Revizuitează și plătește – jos */}
        <section className="mt-10 border-t border-slate-200/80 pt-8 pb-4">
          <div className="mx-auto max-w-2xl rounded-2xl bg-white px-6 py-6 shadow-[var(--shadow-lg)] ring-1 ring-slate-200/80 sm:px-8 sm:py-8">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                {totalPages > 0 ? (
                  <>
                    <p className="text-sm font-medium text-slate-600">Total comandă</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">
                      {totalWithShipping.toFixed(2)} lei
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {totalPrice.toFixed(2)} lei printare + {SHIPPING_COST_LEI} lei transport · {totalPages} pagini
                    </p>
                    {userChosenColorPages > 0 && (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Ai selectat <span className="font-semibold">{userChosenColorPages}</span>{" "}
                        pagini cu opțiunea <span className="font-semibold">Color</span>.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-600">Total comandă</p>
                    <p className="mt-1 text-lg font-semibold text-slate-500 sm:text-xl">
                      Adaugă documente pentru a vedea totalul
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Transport: {SHIPPING_COST_LEI} lei (cost fix per livrare a coletului)
                    </p>
                  </>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-center gap-2 sm:items-end">
                <button
                  type="button"
                  disabled={files.length === 0 || totalPages === 0 || isCheckoutLoading}
                  onClick={handleOpenCheckout}
                  className="flex min-w-[220px] items-center justify-center gap-3 rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-blue-700 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-lg"
                >
                  {isCheckoutLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CreditCard className="h-5 w-5" />
                  )}
                  {isCheckoutLoading ? "Se deschide…" : "Finalizare Comandă"}
                </button>
                <p className="text-xs text-slate-500">
                  Verifici coșul, datele de livrare și alegi metoda de plată
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Overlay succes comandă (ramburs) – mulțumire, livrare 3 zile, detalii fișiere și legare */}
      {orderSuccessDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="rounded-t-2xl bg-green-50 px-6 py-8 text-center">
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                Mulțumim pentru comandă!
              </h2>
              <p className="mt-2 text-slate-700">
                Comanda a fost înregistrată. Livrarea se face în <strong>3 zile lucrătoare</strong>.
              </p>
              {orderSuccessDetails.paymentMethod === "ramburs" && (
                <p className="mt-3 rounded-lg bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
                  Vă vom suna pentru confirmarea comenzii.               </p>
              )}
            </div>
            <div className="max-h-[50vh] overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-800">Rezumat conform grupurilor</h3>
                <ul className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm">
                  {orderSuccessDetails.groups.map((group, groupIdx) => {
                    const isSingleDoc = group.files.length === 1;
                    return (
                      <li key={groupIdx} className="border-b border-slate-200 pb-4 last:border-0 last:pb-0 last:border-b-0">
                        {!isSingleDoc && (
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Volum {groupIdx + 1} — {group.files.length} documente legate împreună
                          </p>
                        )}
                        {group.files.map((f, i) => (
                          <div key={i} className={isSingleDoc ? "mb-1" : "ml-2 border-l-2 border-slate-200 pl-3 py-2 mb-2"}>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <span className="font-medium text-slate-800">{f.name}</span>
                              <span className="text-slate-600">
                                {f.pages != null ? `${f.pages} pagini` : "—"} · {f.copies} copie{f.copies > 1 ? "i" : ""} · {f.printMode === "color" ? "Color" : "Alb-negru"}
                                {f.duplex ? " · Față-verso" : ""}
                              </span>
                            </div>
                          </div>
                        ))}
                        <div className="mt-2 text-slate-600">
                          <p>
                            <span className="font-medium text-slate-700">{isSingleDoc ? "Legare:" : "Legare (acest grup):"}</span>{" "}
                            {group.spiralType === "none" && "Doar print"}
                            {group.spiralType === "plastic" && (
                              <>
                                Spiralare{group.spiralColor ? ` · Culoare ${group.spiralColor}` : ""}
                                {" · "}
                                Copertă față: {group.coverFrontColor === "transparent" ? "Fără" : group.coverFrontColor} · Copertă spate: {group.coverBackColor === "transparent" ? "Fără" : group.coverBackColor}
                              </>
                            )}
                            {group.spiralType === "perforare2" && "Perforare cu 2 găuri"}
                            {group.spiralType === "capsare" && "Capsare (maxim 240 coli)"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="border-t border-slate-200 pt-4 text-sm">
                <p className="font-semibold text-slate-800">
                  Total: {orderSuccessDetails.totalWithShipping.toFixed(2)} lei
                </p>
                <p className="text-slate-600">{orderSuccessDetails.totalPages} pagini</p>
              </div>
            </div>
            <div className="border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={() => setOrderSuccessDetails(null)}
                className="w-full rounded-xl bg-green-600 py-3 font-semibold text-white hover:bg-green-700"
              >
                Închide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal vizualizare coș + livrare + plată */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-8 w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Vizualizează coșul
              </h2>
              <button
                type="button"
                onClick={() => setCheckoutModalOpen(false)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Închide"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5 space-y-6">
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Rezumat comandă
                </p>
                <ul className="space-y-4 rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-700">
                  {bindingGroups.map((group, groupIdx) => {
                    const opts = groupOptions[group.groupIndex] ?? defaultGroupOpts;
                    const spiralLabel = spiralOptions.find((o) => o.value === opts.spiralType)?.label ?? "Fără spirală";
                    const spiralColorLabel = opts.spiralType !== "none" ? spiralColorOptions.find((c) => c.value === opts.spiralColor)?.label ?? opts.spiralColor : null;
                    const coverFrontLabel = coverColors.find((c) => c.value === opts.coverFrontColor)?.label ?? "—";
                    const coverBackLabel = coverColors.find((c) => c.value === opts.coverBackColor)?.label ?? "—";
                    const isSingleDoc = group.filesInGroup.length === 1;
                    return (
                      <li key={group.groupIndex} className="border-b border-slate-200 pb-4 last:border-0 last:pb-0">
                        {!isSingleDoc && (
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Volum {groupIdx + 1} — {group.filesInGroup.length} documente legate împreună
                          </p>
                        )}
                        {group.filesInGroup.map((f) => {
                          const printModeLabel = (f.printMode ?? DEFAULT_PRINT_OPTIONS.printMode) === "color" ? "Color" : "Alb-negru";
                          const duplexLabel = (f.duplex ?? DEFAULT_PRINT_OPTIONS.duplex) ? "Da" : "Nu";
                          return (
                            <div key={f.id} className={isSingleDoc ? "" : "ml-2 border-l-2 border-slate-200 pl-3 py-2"}>
                              <div className="flex items-start justify-between gap-2">
                                <span className="font-medium text-slate-800">{f.name}</span>
                                {f.previewUrl && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewFileId(f.id)}
                                    className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:underline"
                                  >
                                    Preview
                                  </button>
                                )}
                              </div>
                              {f.pages != null && (
                                <p className="mt-0.5 text-slate-500">{f.pages} pagini</p>
                              )}
                              <p className="mt-1.5 text-slate-600">
                                <span className="font-medium text-slate-700">Printare:</span>{" "}
                                {printModeLabel} · Față-verso: {duplexLabel} · {f.copies} {f.copies === 1 ? "copie" : "copii"}
                              </p>
                            </div>
                          );
                        })}
                        <div className="mt-2 text-slate-600">
                          <p>
                            <span className="font-medium text-slate-700">{isSingleDoc ? "Legare:" : "Legare (acest grup):"}</span>{" "}
                            {spiralLabel}
                            {spiralColorLabel != null && `, ${spiralColorLabel}`}
                            {" · "}
                            Copertă față: {coverFrontLabel} · Copertă spate: {coverBackLabel}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 space-y-1 border-t border-slate-200 pt-3 text-sm">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal printare</span>
                    <span>{totalPrice.toFixed(2)} lei</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Transport</span>
                    <span>{SHIPPING_COST_LEI.toFixed(2)} lei</span>
                  </div>
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>Total</span>
                    <span>{totalWithShipping.toFixed(2)} lei</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">
                  Date livrare (colet) <span className="text-red-500">* toate câmpurile sunt obligatorii</span>
                </p>
                <div className="space-y-3">
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">
                      Nume complet <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="text"
                      required
                      aria-required="true"
                      aria-invalid={!!shippingErrors.name}
                      aria-describedby={shippingErrors.name ? "err-name" : undefined}
                      value={shipping.name}
                      onChange={(e) => {
                        setShipping((s) => ({ ...s, name: e.target.value }));
                        if (shippingErrors.name) setShippingErrors((prev) => ({ ...prev, name: undefined }));
                      }}
                      placeholder="Ex: Ion Popescu"
                      minLength={MIN_NAME_LENGTH}
                      maxLength={MAX_NAME_LENGTH}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        shippingErrors.name
                          ? "border-red-400 focus:border-red-500 bg-red-50/50"
                          : "border-slate-300 focus:border-blue-500"
                      }`}
                    />
                    {shippingErrors.name && (
                      <p id="err-name" className="mt-1 text-xs text-red-600" role="alert">
                        {shippingErrors.name}
                      </p>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">
                      Telefon <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="tel"
                      required
                      aria-required="true"
                      aria-invalid={!!shippingErrors.phone}
                      aria-describedby={shippingErrors.phone ? "err-phone" : undefined}
                      value={shipping.phone}
                      onChange={(e) => {
                        setShipping((s) => ({ ...s, phone: e.target.value }));
                        if (shippingErrors.phone) setShippingErrors((err) => ({ ...err, phone: undefined }));
                      }}
                      placeholder="Ex: 0712345678"
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        shippingErrors.phone
                          ? "border-red-400 focus:border-red-500 bg-red-50/50"
                          : "border-slate-300 focus:border-blue-500"
                      }`}
                    />
                    {shippingErrors.phone && (
                      <p id="err-phone" className="mt-1 text-xs text-red-600" role="alert">
                        {shippingErrors.phone}
                      </p>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">
                      Email <span className="text-red-500">*</span>
                    </span>
                    <input
                      type="email"
                      required
                      aria-required="true"
                      aria-invalid={!!shippingErrors.email}
                      aria-describedby={shippingErrors.email ? "err-email" : undefined}
                      value={shipping.email}
                      onChange={(e) => {
                        setShipping((s) => ({ ...s, email: e.target.value }));
                        if (shippingErrors.email) setShippingErrors((err) => ({ ...err, email: undefined }));
                      }}
                      placeholder="email@exemplu.ro"
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        shippingErrors.email
                          ? "border-red-400 focus:border-red-500 bg-red-50/50"
                          : "border-slate-300 focus:border-blue-500"
                      }`}
                    />
                    {shippingErrors.email && (
                      <p id="err-email" className="mt-1 text-xs text-red-600" role="alert">
                        {shippingErrors.email}
                      </p>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs text-slate-500">
                      Adresă livrare <span className="text-red-500">*</span>
                    </span>
                    <textarea
                      required
                      aria-required="true"
                      aria-invalid={!!shippingErrors.address}
                      aria-describedby={shippingErrors.address ? "err-address" : undefined}
                      value={shipping.address}
                      onChange={(e) => {
                        setShipping((s) => ({ ...s, address: e.target.value }));
                        if (shippingErrors.address) setShippingErrors((err) => ({ ...err, address: undefined }));
                      }}
                      placeholder="Strada, nr., localitate, județ, cod poștal"
                      rows={3}
                      minLength={MIN_ADDRESS_LENGTH}
                      maxLength={MAX_ADDRESS_LENGTH}
                      className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                        shippingErrors.address
                          ? "border-red-400 focus:border-red-500 bg-red-50/50"
                          : "border-slate-300 focus:border-blue-500"
                      }`}
                    />
                    {shippingErrors.address && (
                      <p id="err-address" className="mt-1 text-xs text-red-600" role="alert">
                        {shippingErrors.address}
                      </p>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium text-slate-700">
                  Modalitate plată
                </p>
                <div className="space-y-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:bg-slate-50">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === "stripe"}
                      onChange={() => setPaymentMethod("stripe")}
                      className="h-4 w-4 text-blue-600"
                    />
                    <div>
                      <span className="font-medium text-slate-800">
                        Plătesc online (card)
                      </span>
                      <p className="text-xs text-slate-500">
                        Plată securizată prin Stripe. Total {totalWithShipping.toFixed(2)} lei.
                      </p>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors hover:bg-slate-50">
                    <input
                      type="radio"
                      name="paymentMethod"
                      checked={paymentMethod === "ramburs"}
                      onChange={() => setPaymentMethod("ramburs")}
                      className="h-4 w-4 text-blue-600"
                    />
                    <div>
                      <span className="font-medium text-slate-800">
                        Plătesc la livrare (ramburs)
                      </span>
                      <p className="text-xs text-slate-500">
                        Achit coletul la curier. Total {totalWithShipping.toFixed(2)} lei.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {checkoutError && (
                <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                  {checkoutError}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmitCheckout}
                disabled={isCheckoutLoading || isUploading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
                    ? `Confirmă comanda · ${totalWithShipping.toFixed(2)} lei (ramburs)`
                    : `Plătește ${totalWithShipping.toFixed(2)} lei online`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewFileId && (() => {
        const file = files.find((f) => f.id === previewFileId);
        if (!file) return null;
        return (
          <div className="fixed inset-0 z-50 flex min-h-0 flex-col items-center overflow-y-auto bg-black/60 px-4 py-6 backdrop-blur-sm">
            <div className="flex max-h-[90vh] min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/50">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm">
                    <FileText className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Preview document
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {file.name} {file.pages != null && `· ${file.pages} pagini`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewFileId(null)}
                  className="rounded-xl p-2.5 text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm"
                  aria-label="Închide"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t border-slate-100 bg-slate-50/60 p-4 md:flex-row">
                <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
                  {file.previewUrl ? (
                    <iframe
                      src={file.previewUrl}
                      className="h-full min-h-[400px] w-full"
                      title={`Preview ${file.name}`}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      Preview indisponibil
                    </div>
                  )}
                </div>

                <div className="w-full shrink-0 space-y-5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:max-w-xs">
                  <div>
                    <p className="mb-2 text-sm font-medium text-slate-800">
                      Setări pentru acest fișier
                    </p>
                    <div className="space-y-3 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] uppercase tracking-wide text-slate-500">
                          Tip:
                        </span>
                        {userChosenColorPages > 0 && (
                          <p className="text-[11px] text-slate-500">
                            În total, <span className="font-semibold">{userChosenColorPages}</span>{" "}
                            pagini sunt setate pe <span className="font-semibold">Color</span>.
                          </p>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((prev) =>
                              prev.map((f) =>
                                f.id === file.id ? { ...f, printMode: "bw" } : f
                              )
                            )
                          }
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            file.printMode === "bw"
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          Alb-Negru
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setFiles((prev) =>
                              prev.map((f) =>
                                f.id === file.id
                                  ? { ...f, printMode: "color" }
                                  : f
                              )
                            )
                          }
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            file.printMode === "color"
                              ? "bg-blue-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          Color
                        </button>
                      </div>

                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={file.duplex}
                          onChange={(e) =>
                            setFiles((prev) =>
                              prev.map((f) =>
                                f.id === file.id
                                  ? { ...f, duplex: e.target.checked }
                                  : f
                              )
                            )
                          }
                          className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                        />
                        <span>Față-verso</span>
                      </label>

                      <label className="flex items-center gap-2">
                        <span>Copii:</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={file.copies}
                          onChange={(e) => {
                            const next = Number(e.target.value) || 1;
                            setFiles((prev) =>
                              prev.map((f) =>
                                f.id === file.id
                                  ? {
                                      ...f,
                                      copies: Math.min(50, Math.max(1, next)),
                                    }
                                  : f
                              )
                            );
                          }}
                          className="w-16 rounded border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-4">
                    <p className="mb-2 text-sm font-medium text-slate-800">
                      Spirală pentru comandă
                    </p>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {spiralOptions.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            updateSelectedGroupOptions({
                              spiralType: value,
                              ...(value !== "none" ? { spiralColor: "negru" } : {}),
                            });
                          }}
                          className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2 ${
                            spiralType === value
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                          }`}
                        >
                          <span className="text-xs font-medium">{label}</span>
                          <span className="text-[11px] opacity-80">
                            {value === "none" && "Doar print"}
                            {value === "plastic" && "Spiralare"}
                            {value === "perforare2" && "Perforare 2 găuri"}
                            {value === "capsare" && "Capsare (max 240 coli)"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {spiralType !== "none" && (
                    <div className="space-y-4 border-t border-slate-200 pt-4">
                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-800">
                          Culoare spirală
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          {spiralColorOptions.map(({ value, label, circleClass }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => updateSelectedGroupOptions({ spiralColor: value })}
                              className="flex flex-col items-center gap-1 text-xs"
                              title={label}
                            >
                              <span
                                className={`flex h-9 w-9 shrink-0 rounded-full transition-all duration-200 ${
                                  spiralColor === value
                                    ? "ring-3 ring-blue-500 ring-offset-2"
                                    : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"
                                } ${circleClass}`}
                              />
                              <span className="text-[11px] text-slate-600">
                                {label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-800">
                          Copertă față
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          {coverColors.map(({ value, label, circleClass }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => updateSelectedGroupOptions({ coverFrontColor: value })}
                              className="flex flex-col items-center gap-1 text-xs"
                              title={label}
                            >
                              <span
                                className={`flex h-9 w-9 shrink-0 rounded-full transition-all duration-200 ${
                                  coverFrontColor === value
                                    ? "ring-3 ring-blue-500 ring-offset-2"
                                    : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"
                                } ${circleClass}`}
                              />
                              <span className="text-[11px] text-slate-600">
                                {label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="mb-2 text-sm font-medium text-slate-800">
                          Copertă spate
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          {coverColors.map(({ value, label, circleClass }) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => updateSelectedGroupOptions({ coverBackColor: value })}
                              className="flex flex-col items-center gap-1 text-xs"
                              title={label}
                            >
                              <span
                                className={`flex h-9 w-9 shrink-0 rounded-full transition-all duration-200 ${
                                  coverBackColor === value
                                    ? "ring-3 ring-blue-500 ring-offset-2"
                                    : "ring-2 ring-transparent ring-offset-2 hover:ring-slate-300"
                                } ${circleClass}`}
                              />
                              <span className="text-[11px] text-slate-600">
                                {label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
