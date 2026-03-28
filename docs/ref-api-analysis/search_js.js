(async () => {
  try {
    const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.src);
    const indexScript = scripts.find(s => s.includes('index-bi3S9yvE.js'));
    if (!indexScript) return { error: 'No index script found' };
    
    const resp = await fetch(indexScript);
    const text = await resp.text();
    
    const results = {
      firebaseConfig: text.match(/apiKey:["']([^"']+)["'],authDomain:["']([^"']+)["'],projectId:["']([^"']+)["']/),
      cloudFunctions: text.match(/https?:\/\/[a-zA-Z0-9.-]+\.cloudfunctions\.net\/[a-zA-Z0-9/_-]+/g),
      googleApis: text.match(/https?:\/\/identitytoolkit\.googleapis\.com\/[a-zA-Z0-9/_-]+/g),
      refToolsApi: text.match(/https?:\/\/[a-zA-Z0-9.-]+\.ref\.tools\/[a-zA-Z0-9/_-]+/g),
      individualApiKey: text.match(/apiKey:["']([^"']+)["']/g),
      individualAuthDomain: text.match(/authDomain:["']([^"']+)["']/g),
      individualProjectId: text.match(/projectId:["']([^"']+)["']/g),
      functionKeywords: {
        createApiKey: text.includes('createApiKey'),
        onEmailVerified: text.includes('onEmailVerified'),
        updateMarketingConsent: text.includes('updateMarketingConsent')
      }
    };
    return { __debug: ["script ran"], __result: results };
  } catch (e) {
    return { error: e.toString() };
  }
})()