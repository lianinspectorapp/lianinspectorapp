 
        // variabel global
        let sheetUsers = [];
        let sheetCategories = [];
        let sheetItems = [];
        let sheetInspections = [];
        let sheetInspectionDetails = [];
        let sheetPhotos = [];
		 let usersList = [];
        
        // Alias for compatibility
        let allUsers = [];
        let allCategories = [];
        let allItems = [];
        let allInspections = [];
        
        let currentUser = null;
        let adminExists = false;
        let selectedCategoryFilter = null;
        let currentInspectionData = null;
        let currentDraftId = null;
let syncInProgress = false;
		 let deleteTargetId = null;
         window.deleteConfirmationId = null;
         
