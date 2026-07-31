export const TICKET_PARTY_CATEGORIES = [
  "preschool",
  "elementary",
  "junior_high",
  "high_school",
  "university",
  "adult",
  "other",
] as const;

export type TicketPartyCategory = (typeof TICKET_PARTY_CATEGORIES)[number];

export type TicketPartyGroup = {
  id: string;
  category: TicketPartyCategory;
  age: number | null;
  count: number;
};

export type TicketUsePreference = "full_day" | "half_day";

export type LiftTicketSearchInput = {
  visitDate: string;
  usePreference: TicketUsePreference;
  party: TicketPartyGroup[];
};

export type LiftTicketAudience = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  age_min?: number | null;
  age_max?: number | null;
  school_levels?: string[];
  notes_ja?: string | null;
};

export type LiftTicketCalendar = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  day_types?: string[];
  dates?: string[];
  date_ranges?: Array<{ start: string; end: string }>;
  excluded_dates?: string[];
  notes_ja?: string | null;
};

export type LiftTicketValidity = {
  mode?: string;
  hours?: number | null;
  days?: number | null;
  rides?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  notes_ja?: string | null;
};

export type LiftTicketProduct = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  product_type?: string;
  validity?: LiftTicketValidity;
  included_items?: Array<{
    type?: string;
    name_ja: string;
    description_ja?: string | null;
    notes_ja?: string | null;
  }>;
  notes_ja?: string | null;
};

export type LiftTicketChannel = {
  id: string;
  name_ja: string;
  channel_type?: string;
  url?: string | null;
  purchase_deadline_ja?: string | null;
  notes_ja?: string | null;
};

export type LiftTicketPeriod = {
  start?: string | null;
  end?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  deadline_ja?: string | null;
  notes_ja?: string | null;
};

export type LiftTicketPrice = {
  mode?: string;
  currency?: string;
  amount?: number | null;
  date_table?: Array<{
    dates?: string[];
    start?: string | null;
    end?: string | null;
    calendar_id?: string | null;
    amount?: number | null;
  }>;
  base_offer_id?: string | null;
  discount?: {
    type?: "amount" | "percent";
    value?: number;
  };
  range?: {
    min?: number | null;
    max?: number | null;
  } | null;
  live_lookup_required?: boolean;
  live_lookup_url?: string | null;
  notes_ja?: string | null;
};

export type LiftTicketOffer = {
  id: string;
  name_ja: string;
  official_label_ja?: string | null;
  offer_type?: string;
  discount_reasons?: string[];
  product_id: string;
  audience_ids?: string[];
  calendar_ids?: string[];
  channel_ids?: string[];
  eligibility_conditions?: Array<{
    type?: string;
    official_label_ja?: string | null;
    description_ja?: string | null;
  }>;
  sales_period?: LiftTicketPeriod | null;
  use_period?: LiftTicketPeriod | null;
  purchase_deadline?: {
    mode?: string;
    official_text_ja?: string | null;
  } | null;
  price?: LiftTicketPrice;
  requirements?: Array<{
    description_ja?: string;
    proof_types?: string[];
  }>;
  confidence?: string;
  notes_ja?: string | null;
};

export type LiftTicketFee = {
  id: string;
  name_ja: string;
  fee_type?: string;
  amount?: number | null;
  currency?: string;
  refundable?: boolean | null;
  refund_conditions_ja?: string | null;
  applies_to_product_ids?: string[];
  notes_ja?: string | null;
};

export type LiftTicketData = {
  schema_version: string;
  // スキー場の名称・都道府県・公式サイトURLは SkiResort マスタが正本なので持たない
  resort: {
    id: string;
  };
  season: {
    id: string;
    label_ja: string;
    start_date?: string | null;
    end_date?: string | null;
    notes_ja?: string | null;
  };
  audiences: LiftTicketAudience[];
  calendars: LiftTicketCalendar[];
  products: LiftTicketProduct[];
  channels: LiftTicketChannel[];
  offers: LiftTicketOffer[];
  party_rules: Array<{
    id: string;
    name_ja: string;
    description_ja?: string | null;
  }>;
  fees: LiftTicketFee[];
  calculation_policy?: {
    currency?: string;
    tax_included?: boolean | null;
    best_price_hint_ja?: string | null;
    notes_ja?: string | null;
  };
  data_quality: {
    status: string;
    last_verified_at?: string | null;
    unresolved_questions?: Array<{
      id: string;
      question_ja: string;
      related_ids?: string[];
    }>;
    human_review_required?: string[];
    notes_ja?: string | null;
  };
};

export type TicketCalculationLine = {
  groupId: string;
  groupLabel: string;
  count: number;
  audienceName: string | null;
  productName: string | null;
  offerName: string | null;
  unitAmount: number | null;
  subtotal: number | null;
  note: string | null;
};

export type TicketCalculationFee = {
  name: string;
  amount: number;
  refundable: boolean | null;
  total: number;
};

export type TicketCalculationResult = {
  status: "complete" | "partial" | "unavailable" | "outside_season";
  visitDate: string;
  seasonLabel: string;
  productId: string | null;
  productName: string | null;
  lines: TicketCalculationLine[];
  fees: TicketCalculationFee[];
  ticketTotal: number | null;
  knownTicketTotal: number;
  payableTotal: number | null;
  partyCount: number;
  conditionalOfferNames: string[];
  notes: string[];
};
