export async function applyPortalSettings() {
    try {
        const response = await fetch('/api/method/skillshub_core.skillshub_portal.doctype.skillshub_portal_settings.skillshub_portal_settings.get_portal_settings', {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error("Portal Settings API returned status:", response.status);
            return;
        }

        const data = await response.json();
        
        if (data && data.message) {
            const settings = data.message;
            const root = document.documentElement;
            
            if (settings.primary_color) {
                root.style.setProperty('--color-teal-700', settings.primary_color);
            }
            if (settings.secondary_color) {
                root.style.setProperty('--color-teal-800', settings.secondary_color);
            }
            if (settings.header_gradient) {
                root.style.setProperty('--header-gradient', settings.header_gradient);
            }
            
            // Set Favicon
            if (settings.favicon) {
                let favicon = document.getElementById('sh-favicon');
                if (!favicon) {
                    favicon = document.createElement('link');
                    favicon.id = 'sh-favicon';
                    favicon.rel = 'icon';
                    document.head.appendChild(favicon);
                }
                favicon.href = settings.favicon;
            }

            // Expose Logo for login page usage
            window.__shLogoUrl = settings.logo;
        }
    } catch (error) {
        console.error('Failed to apply portal settings:', error);
    }
}
