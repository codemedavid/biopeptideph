import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { IMMUTABLE_CACHE_SECONDS } from './useImageUpload';
import { SmartGuide, SmartGuideFile } from '../types';

export const useSmartGuides = () => {
    const [guides, setGuides] = useState<SmartGuide[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchGuides();
    }, []);

    const fetchGuides = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch guides
            const { data: guidesData, error: guidesError } = await supabase
                .from('smart_guides')
                .select('*')
                .order('sort_order', { ascending: true })
                .order('created_at', { ascending: false });

            if (guidesError) throw guidesError;

            if (!guidesData) {
                setGuides([]);
                return;
            }

            // Fetch files for these guides
            // We could use a join query but RLS sometimes makes that tricky if strict policies apply, 
            // but separate query is fine given small scale.
            const guideIds = guidesData.map(g => g.id);

            let filesData: SmartGuideFile[] = [];
            if (guideIds.length > 0) {
                const { data: files, error: filesError } = await supabase
                    .from('smart_guide_files')
                    .select('*')
                    .in('guide_id', guideIds)
                    .order('sort_order', { ascending: true });

                if (filesError) throw filesError;
                filesData = files || [];
            }

            // Combine them
            const guidesWithFiles = guidesData.map(guide => ({
                ...guide,
                files: filesData.filter(f => f.guide_id === guide.id)
            }));

            setGuides(guidesWithFiles);
        } catch (err) {
            console.error('Error fetching smart guides:', err);
            setError(err instanceof Error ? err.message : 'Failed to fetch guides');
        } finally {
            setLoading(false);
        }
    };

    const createGuide = async (title: string) => {
        try {
            const { data, error } = await supabase
                .from('smart_guides')
                .insert([{ title, is_active: true }])
                .select()
                .single();

            if (error) throw error;

            await fetchGuides();
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    };

    const updateGuide = async (id: string, updates: Partial<SmartGuide>) => {
        try {
            // Remove files field if present as it's not a column
            const { files, ...dbUpdates } = updates as any;

            const { data, error } = await supabase
                .from('smart_guides')
                .update(dbUpdates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;

            await fetchGuides();
            return { success: true, data };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    };

    const deleteGuide = async (id: string) => {
        try {
            const { error } = await supabase
                .from('smart_guides')
                .delete()
                .eq('id', id);

            if (error) throw error;

            await fetchGuides();
            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    };

    const addFile = async (guideId: string, file: File, displayName: string) => {
        try {
            // 1. Upload file
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${guideId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('guide-files')
                .upload(filePath, file, { cacheControl: IMMUTABLE_CACHE_SECONDS });

            if (uploadError) throw uploadError;

            const { data: urlData } = supabase.storage
                .from('guide-files')
                .getPublicUrl(filePath);

            // 2. Determine file type
            let fileType = 'document';
            if (file.type.startsWith('image/')) fileType = 'image';
            else if (file.type === 'application/pdf') fileType = 'pdf';

            // 3. Insert record
            const { data, error: dbError } = await supabase
                .from('smart_guide_files')
                .insert([{
                    guide_id: guideId,
                    display_name: displayName,
                    file_url: urlData.publicUrl,
                    file_type: fileType,
                    sort_order: 0
                }])
                .select()
                .single();

            if (dbError) throw dbError;

            await fetchGuides();
            return { success: true, data };

        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    };

    const deleteFile = async (fileId: string, fileUrl: string) => {
        try {
            // 1. Delete from storage
            // Extract path from URL
            const urlParts = fileUrl.split('/guide-files/');
            if (urlParts.length > 1) {
                const path = urlParts[1];
                await supabase.storage
                    .from('guide-files')
                    .remove([path]);
            }

            // 2. Delete from DB
            const { error } = await supabase
                .from('smart_guide_files')
                .delete()
                .eq('id', fileId);

            if (error) throw error;

            await fetchGuides();
            return { success: true };
        } catch (err) {
            return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
        }
    };

    return {
        guides,
        loading,
        error,
        createGuide,
        updateGuide,
        deleteGuide,
        addFile,
        deleteFile,
        refreshGuides: fetchGuides
    };
};
