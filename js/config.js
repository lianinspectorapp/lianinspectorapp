		 const SUPABASE_URL = "https://qkfiijfqhcfafyemmxtk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFrZmlpamZxaGNmYWZ5ZW1teHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5MjE3NzQsImV4cCI6MjA5ODQ5Nzc3NH0.PZF1sknni7CgQYKexgwZemaF_JzezoTbmMDtqEnXKdI";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("✅ Supabase client:", supabaseClient);

const GAS_UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbxZS4P-V0mUfleODfJ3ul-SL4EH078GM-71xdokv-ffYPufrvKD0OdX68fn_9UPLxbK/exec';
