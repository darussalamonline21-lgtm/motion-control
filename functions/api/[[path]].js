const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,x-magnific-api-key',
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    });
}

function getApiPath(params) {
    const path = params.path || '';
    return Array.isArray(path) ? path.join('/') : path;
}

export async function onRequest({ request, env, params }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    const apiPath = getApiPath(params);

    if (apiPath === 'config') {
        return json({ requiresClientApiKey: !env.MAGNIFIC_API_KEY });
    }

    const apiKey = env.MAGNIFIC_API_KEY || request.headers.get('x-magnific-api-key');
    if (!apiKey) {
        return json({ error: 'Missing x-magnific-api-key header or MAGNIFIC_API_KEY secret' }, 401);
    }

    const requestUrl = new URL(request.url);
    const targetUrl = new URL(`https://api.magnific.com/v1/ai/${apiPath}`);
    targetUrl.search = requestUrl.search;

    const headers = {
        'x-magnific-api-key': apiKey,
        'Content-Type': request.headers.get('Content-Type') || 'application/json',
    };

    const fetchOptions = {
        method: request.method,
        headers,
    };

    if (!['GET', 'HEAD'].includes(request.method)) {
        fetchOptions.body = await request.text();
    }

    try {
        const response = await fetch(targetUrl, fetchOptions);
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: {
                ...corsHeaders,
                'Content-Type': response.headers.get('Content-Type') || 'application/json',
            },
        });
    } catch (err) {
        return json({ error: `Proxy error: ${err.message}` }, 500);
    }
}
