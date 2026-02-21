import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({
            status: 'error',
            message: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables',
        });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Simple query to keep the database active
        const { data, error } = await supabase.rpc('version');

        if (error) {
            // Fallback: try a simple select if rpc fails
            const { error: fallbackError } = await supabase
                .from('products')
                .select('id')
                .limit(1);

            if (fallbackError) {
                return res.status(500).json({
                    status: 'unhealthy',
                    error: fallbackError.message,
                    timestamp: new Date().toISOString(),
                });
            }
        }

        return res.status(200).json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        return res.status(500).json({
            status: 'unhealthy',
            error: err.message,
            timestamp: new Date().toISOString(),
        });
    }
}
