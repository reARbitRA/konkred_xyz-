import { 
  collection, 
  addDoc,
  serverTimestamp
} from './documents';
import { db } from './supabase.ts';

/**
 * Database service — lean post-purge version.
 *
 * The mock marketplace layer was removed: no MOCK_LISTINGS fallback, no fake
 * listings, no wallet/ledger/dispute/purchase simulation. What remains are
 * real, honest persistence helpers (waitlist, contact, product leads). Every
 * method surfaces failures to the caller; the UI never pretends a write
 * succeeded when it did not.
 */
class DatabaseService {
    /**
     * Records a waitlist access request in Supabase.
     * Returns the ticket id only after a successful write; throws otherwise.
     */
    async joinWaitlist(email: string): Promise<string> {
        const arr = new Uint16Array(1);
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(arr);
        const ticketNum = 1000 + (arr[0] % 9000);
        const ticketId = `#KND-${ticketNum}`;

        await addDoc(collection(db, 'waitlist'), {
            email,
            ticketId,
            createdAt: serverTimestamp()
        });
        return ticketId;
    }

    /**
     * Persists customer inquiry/contact form data to Supabase.
     */
    async submitContactMessage(data: { name: string; email: string; subject: string; message: string }): Promise<void> {
        await addDoc(collection(db, 'contact_messages'), {
            ...data,
            createdAt: serverTimestamp()
        });
    }

    /**
     * Persists a product lead (Workflow Kit purchase intent, Validation Sprint
     * booking, Enterprise Pilot request, or All-Catalog Workspace inquiry).
     * Test-mode safe: the caller must only show success when this resolves.
     */
    async submitProductLead(data: {
        productSlug?: string | null;
        intent: 'workflow_kit' | 'validation_sprint' | 'enterprise_pilot' | 'all_catalog_workspace';
        name: string;
        email: string;
        company?: string;
        message?: string;
        acceptedTerms: boolean;
    }): Promise<void> {
        await addDoc(collection(db, 'product_leads'), {
            ...data,
            acceptedTerms: Boolean(data.acceptedTerms),
            testMode: true,
            createdAt: serverTimestamp()
        });
    }
}

export const databaseService = new DatabaseService();
