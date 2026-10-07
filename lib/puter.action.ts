import puter from "@heyputer/puter.js";
import {getOrCreateHostingConfig, uploadImageToHosting} from "./puter.hosting";
import {isHostedUrl} from "./utils";
import {PUTER_WORKER_URL} from "./constants";

export const signIn = async () => await puter.auth.signIn();

export const signOut = () => puter.auth.signOut();

export const getCurrentUser = async () => {
    try {
        return await puter.auth.getUser();
    } catch {
        return null;
    }
}

export const createProject = async ({ item, visibility = "private" }: CreateProjectParams): Promise<DesignItem | null | undefined> => {
    const projectId = item.id;

    let hosting: HostingConfig | null = null;
    let hostedSource: HostedAsset | null = null;
    let hostedRender: HostedAsset | null = null;

    try {
        hosting = await getOrCreateHostingConfig();
        if (hosting && projectId) {
            hostedSource = await uploadImageToHosting({ hosting, url: item.sourceImage, projectId, label: 'source' });
            if (item.renderedImage) {
                hostedRender = await uploadImageToHosting({ hosting, url: item.renderedImage, projectId, label: 'rendered' });
            }
        }
    } catch (e) {
        console.warn('Hosting upload warning:', e);
    }

    const resolvedSource = hostedSource?.url || (isHostedUrl(item.sourceImage) ? item.sourceImage : item.sourceImage);
    const resolvedRender = hostedRender?.url
        ? hostedRender.url
        : item.renderedImage && isHostedUrl(item.renderedImage)
            ? item.renderedImage
            : item.renderedImage || undefined;

    const {
        sourcePath: _sourcePath,
        renderedPath: _renderedPath,
        publicPath: _publicPath,
        ...rest
    } = item;

    const payload: DesignItem = {
        ...rest,
        sourceImage: resolvedSource,
        renderedImage: resolvedRender,
    };

    if(!PUTER_WORKER_URL) {
        console.warn('Missing VITE_PUTER_WORKER_URL; returning local payload.');
        return payload;
    }

    try {
        const workerUrl = PUTER_WORKER_URL.trim().replace(/\/$/, "");
        const response = await puter.workers.exec(`${workerUrl}/api/projects/save`, {
            method: 'POST',
            body: JSON.stringify({
                project: payload,
                visibility
            })
        });

        if(!response.ok) {
            console.error('Failed to save project via Puter worker:', await response.text());
            return payload;
        }

        const data = (await response.json()) as { project?: DesignItem | null };
        return data?.project ?? payload;
    } catch (e) {
        console.log('Failed to save project, returning local payload:', e);
        return payload;
    }
}

export const getProjects = async () => {
    if(!PUTER_WORKER_URL) {
        console.warn('Missing VITE_PUTER_WORKER_URL; skip history fetch;');
        return []
    }

    try {
        const workerUrl = PUTER_WORKER_URL.trim().replace(/\/$/, "");
        const response = await puter.workers.exec(`${workerUrl}/api/projects/list`, { method: 'GET' });

        if(!response.ok) {
            console.error('Failed to fetch history', await response.text());
            return [];
        }

        const data = (await response.json()) as { projects?: DesignItem[] | null };

        return Array.isArray(data?.projects) ? data?.projects : [];
    } catch (e) {
        console.error('Failed to get projects', e);
        return [];
    }
}

export const getProjectById = async ({ id }: { id: string }) => {
    if (!PUTER_WORKER_URL) {
        console.warn("Missing VITE_PUTER_WORKER_URL; skipping project fetch.");
        return null;
    }

    try {
        const workerUrl = PUTER_WORKER_URL.trim().replace(/\/$/, "");
        const response = await puter.workers.exec(
            `${workerUrl}/api/projects/get?id=${encodeURIComponent(id)}`,
            { method: "GET" },
        );

        if (!response.ok) {
            console.error("Failed to fetch project:", await response.text());
            return null;
        }

        const data = (await response.json()) as {
            project?: DesignItem | null;
        };

        return data?.project ?? null;
    } catch (error) {
        console.error("Failed to fetch project:", error);
        return null;
    }
};