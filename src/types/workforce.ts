
export interface Worker {
  id: string;
  name: string;
  role: string;
  hourly_rate: number;
  status: 'active' | 'inactive';
  created_at?: string;
}

export interface WorkerGroup {
  id: string;
  name: string;
  created_at?: string;
  // A kapcsolódó tagok (frontend oldali join után)
  members?: Worker[];
}

export interface Timesheet {
  id: string;
  worker_id: string;
  project_id: string;
  date: string;
  hours: number;
  description?: string;
  calculated_cost: number;
  created_at?: string;
  
  // ÚJ MEZŐK a csoportosításoz
  batch_id?: string;
  group_name?: string;

  // Opcionális mezők JOIN lekérdezésekhez
  workers?: Worker;
  projects?: {
    id: string;
    name: string;
  };
}

export interface WorkerStats {
  worker_id: string;
  worker_name: string;
  total_hours: number;
  total_cost: number;
}
