
export interface Subcontractor {
  id: string;
  name: string;
  trade: string;
  contact_info?: string;
  tax_number?: string;
  status: 'active' | 'inactive' | 'blacklist';
  created_at?: string;
}

export interface SubcontractorJob {
  id: string;
  project_id: string;
  subcontractor_id: string;
  description: string;
  agreed_price: number;
  status: 'active' | 'completed';
  created_at?: string;
  
  // Relations
  subcontractors?: Subcontractor;
  projects?: { id: string; name: string; };
  subcontractor_payments?: SubcontractorPayment[];
  
  // Calculated frontend properties
  total_paid?: number;
  progress?: number;
}

export interface SubcontractorPayment {
  id: string;
  job_id: string;
  amount: number;
  payment_date: string;
  note?: string;
  created_at?: string;
}
