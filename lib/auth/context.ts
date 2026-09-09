import { createServerSupabaseClient } from '../supabase/server';
import { supabaseAdmin } from '../supabase/admin';

export const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
export const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000002';

export interface TenantContext {
  userId: string;
  organizationId: string;
  organizationName: string;
  isDemoMode: boolean;
}

/**
 * Resolves current tenant context from Supabase session or default demo organization.
 */
export async function getTenantContext(): Promise<TenantContext> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Find or create member's organization
      const { data: member } = await supabaseAdmin
        .from('organization_members')
        .select('organization_id, organizations(name)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (member?.organization_id) {
        return {
          userId: user.id,
          organizationId: member.organization_id,
          organizationName: (member.organizations as any)?.name || 'My Organization',
          isDemoMode: false,
        };
      }

      // If user exists without org, assign to default or create one
      return {
        userId: user.id,
        organizationId: DEFAULT_ORG_ID,
        organizationName: 'Personal Workspace',
        isDemoMode: false,
      };
    }
  } catch (err) {
    // If SSR session check fails, fallback to default tenant
  }

  return {
    userId: DEFAULT_USER_ID,
    organizationId: DEFAULT_ORG_ID,
    organizationName: 'Demo Workspace',
    isDemoMode: true,
  };
}
