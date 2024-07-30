export interface iProject {
    id: string;
    owner_id: string;
    title: string;
    description: string;
    base_locale: string;
    organization_id: string;
    organization_name: string;
    target_locales: string[];
    default_locales: string[];
    settings: any;
    admin: string[];
    last_activity: string;
    totals: any;
    visitor_locale: string;
}
