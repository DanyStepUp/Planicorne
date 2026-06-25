import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Retrieve the Service Account key from Supabase environment secrets
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON');
    if (!serviceAccountJson) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON environment variable is not set. Please set it in Supabase secrets.');
    }

    let credentials;
    try {
      credentials = JSON.parse(serviceAccountJson);
    } catch (parseErr) {
      throw new Error(`Failed to parse GOOGLE_SERVICE_ACCOUNT_JSON: ${parseErr.message}`);
    }

    const clientEmail = credentials.client_email;
    const privateKeyPEM = credentials.private_key;

    if (!clientEmail || !privateKeyPEM) {
      throw new Error('Invalid service account JSON: client_email or private_key is missing.');
    }

    // 2. Authenticate and retrieve an Access Token from Google OAuth2
    console.log('Generating Google OAuth2 Access Token...');
    const accessToken = await getGoogleAccessToken(clientEmail, privateKeyPEM);

    // 3. Download the Google Sheet as CSV via Google Drive API
    // Spreadsheet ID from the original url: 1yt1xjv8eFcasWs2rwJm8OZa_dyKQNUKdrSKsSs8MBq0
    const spreadsheetId = '1yt1xjv8eFcasWs2rwJm8OZa_dyKQNUKdrSKsSs8MBq0';
    console.log(`Fetching CSV for Google Sheet ID: ${spreadsheetId}...`);
    
    // We export using the Drive API export endpoint which is the standard way to export Sheets
    const driveExportUrl = `https://www.googleapis.com/drive/v3/files/${spreadsheetId}/export?mimeType=text/csv`;

    const response = await fetch(driveExportUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Drive API returned status ${response.status}: ${errorText}`);
    }

    const csvText = await response.text();
    console.log('Successfully fetched and exported spreadsheet data.');

    // 4. Return the CSV data directly to the client
    return new Response(csvText, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv; charset=utf-8'
      },
      status: 200
    });

  } catch (error) {
    console.error('Error in fetch-performance-sheet function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
})

// Helper function to generate Google OAuth2 token using Web Crypto API (RS256)
async function getGoogleAccessToken(clientEmail: string, privateKeyPEM: string): Promise<string> {
  // Clean PEM headers/footers/whitespace
  const cleanKey = privateKeyPEM
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  // Convert base64 key to binary array
  const binaryKey = Uint8Array.from(atob(cleanKey), c => c.charCodeAt(0));

  // Import PKCS#8 private key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );

  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  // Base64Url encoder utility
  const base64UrlEncode = (obj: any) => {
    const str = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(str);
    const binString = String.fromCharCode(...bytes);
    return btoa(binString)
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const headerEncoded = base64UrlEncode(header);
  const claimEncoded = base64UrlEncode(claim);
  const dataToSign = new TextEncoder().encode(`${headerEncoded}.${claimEncoded}`);

  // Sign using RSA-SHA256 (RSASSA-PKCS1-v1_5)
  const signatureBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    dataToSign
  );

  const signatureBinString = String.fromCharCode(...new Uint8Array(signatureBytes));
  const signatureEncoded = btoa(signatureBinString)
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const jwtAssertion = `${headerEncoded}.${claimEncoded}.${signatureEncoded}`;

  // Request Access Token from Google OAuth2
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwtAssertion}`,
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Google OAuth token exchange failed: ${errText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}
