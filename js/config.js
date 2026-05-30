		 const SUPABASE_URL = "https://hbsxxfdxahpqaapaogrn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhic3h4ZmR4YWhwcWFhcGFvZ3JuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NDUwMjIsImV4cCI6MjA5MTEyMTAyMn0.S-oWS2F0Ugob5jzB_MH6WRUlbUcT4DVSKeATtaVcSzI";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("✅ Supabase client:", supabaseClient);

const GAS_UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbxZS4P-V0mUfleODfJ3ul-SL4EH078GM-71xdokv-ffYPufrvKD0OdX68fn_9UPLxbK/exec';