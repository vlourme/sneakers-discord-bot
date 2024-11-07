// Sift is a small routing library that abstracts away details like starting a
// listener on a port, and provides a simple function (serve) that has an API
// to invoke a function for a specific path.
import {
    json,
    serve,
    validateRequest,
} from "https://deno.land/x/sift@0.6.0/mod.ts";
// TweetNaCl is a cryptography library that we use to verify requests
// from Discord.
import nacl from "https://esm.sh/tweetnacl@v1.0.3?dts";

// For all requests to "/" endpoint, we want to invoke home() handler.
serve({
    "/": home,
});

// The main logic of the Discord Slash Command is defined in this function.
async function home(request: Request) {
    // validateRequest() ensures that a request is of POST method and
    // has the following headers.
    const { error } = await validateRequest(request, {
        POST: {
            headers: ["X-Signature-Ed25519", "X-Signature-Timestamp"],
        },
    });
    if (error) {
        return json({ error: error.message }, { status: error.status });
    }

    // verifySignature() verifies if the request is coming from Discord.
    // When the request's signature is not valid, we return a 401 and this is
    // important as Discord sends invalid requests to test our verification.
    const { valid, body } = await verifySignature(request);
    if (!valid) {
        return json(
            { error: "Invalid request" },
            {
                status: 401,
            },
        );
    }

    const { type = 0, data = { options: [] } } = JSON.parse(body);
    // Discord performs Ping interactions to test our application.
    // Type 1 in a request implies a Ping interaction.
    if (type === 1) {
        return json({
            type: 1, // Type 1 in a response is a Pong interaction response type.
        });
    }

    // Type 2 in a request is an ApplicationCommand interaction.
    // It implies that a user has issued a command.
    if (type === 2) {
        const { value } = data.options.find((option: any) => option.name === "query");

        const response = await fetch(`https://api.sneakersapi.dev/search?query=${value}`);
        const products = await response.json();

        if (products.hits.length === 0) {
            return json({
                type: 4,
                data: {
                    content: `🔍 No results found for \`${value}\``,
                },
            });
        }

        const product = products.hits[0];
        const fields = [];

        if (product.release_date) {
            fields.push({
                "name": "Release date",
                "value": new Date(product.release_date)
                    .toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
                "inline": true
            });
        }

        if (product.retail_price) {
            fields.push({
                "name": "Retail price",
                "value": `${product.retail_price}$`,
                "inline": true
            });
        }

        let description = product.description.replace(/<[^>]*>?/g, '').slice(0, 300);
        if (description.length === 300) {
            description = `${description.slice(0, 297)}...`;
        }

        const sizes = product.variants.map((variant: any) => variant.size)
            .sort((a: string, b: string) => Number(a) - Number(b));

        let sizeText = sizes[0];
        if (sizes[sizes.length - 1] !== sizeText) {
            sizeText += "-" + sizes[sizes.length - 1];
        }

        return json({
            // Type 4 responds with the below message retaining the user's
            // input at the top.
            type: 4,
            data: {
                embeds: [{
                    "title": product.title,
                    "description": description,
                    "color": 5195493,
                    "fields": [
                        {
                            "name": "Daily average price",
                            "value": `US$ ${product.avg_price}`,
                            "inline": true
                        },
                        ...fields,
                        {
                            "name": "Variants",
                            "value": sizeText,
                            "inline": true
                        },
                    ],
                    "image": {
                        "url": product.image
                    }
                }],
                "components": [
                    {
                        "type": 1,
                        "components": [
                            {
                                "type": 2,
                                "style": 5,
                                "label": "StockX",
                                "url": product.link,
                                "disabled": false,
                                "emoji": {
                                    "name": "🛒",
                                    "animated": false
                                }
                            },
                            {
                                "type": 2,
                                "style": 5,
                                "label": "Learn more",
                                "url": `https://sneakersapi.dev/products/${product.slug}`,
                                "disabled": false,
                                "emoji": {
                                    "name": "📊",
                                    "animated": false
                                }
                            }
                        ]
                    }
                ],
            },
        });
    }

    // We will return a bad request error as a valid Discord request
    // shouldn't reach here.
    return json({ error: "bad request" }, { status: 400 });
}

/** Verify whether the request is coming from Discord. */
async function verifySignature(
    request: Request,
): Promise<{ valid: boolean; body: string }> {
    const PUBLIC_KEY = Deno.env.get("DISCORD_PUBLIC_KEY")!;
    // Discord sends these headers with every request.
    const signature = request.headers.get("X-Signature-Ed25519")!;
    const timestamp = request.headers.get("X-Signature-Timestamp")!;
    const body = await request.text();
    const valid = nacl.sign.detached.verify(
        new TextEncoder().encode(timestamp + body),
        hexToUint8Array(signature),
        hexToUint8Array(PUBLIC_KEY),
    );

    return { valid, body };
}

/** Converts a hexadecimal string to Uint8Array. */
function hexToUint8Array(hex: string) {
    return new Uint8Array(
        hex.match(/.{1,2}/g)!.map((val) => parseInt(val, 16)),
    );
}