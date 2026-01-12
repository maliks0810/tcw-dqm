import { useOktaAuth } from '@okta/okta-react';
import { useCallback } from 'react';

//This is a simple example of a custom hook used to
//wrap up some functionality. It's the counterpart to
//a utility function except where calls to other hooks
//are required.
//It's important to pay attention to the other hooks used
//in custom hooks. In this case, this hook cannot effectively
//be used outside of the scope of the Okta context profiler
//else "okta" will be null.

//This hook returns an async function that can be called to 
//retrieve or renew and retrieve the latest Access Token. It
//also ensures that the token starts with "Bearer ". Will
//throw an error if Okta or the token is undefined. 
export function useBearerToken(): () => Promise<string> {
    const okta = useOktaAuth();
    return useCallback(async () => {
        if (!okta?.oktaAuth) {
            throw new Error('Context for OktaAuth is not set or is unavailable.')
        }

        const token = await okta?.oktaAuth?.getOrRenewAccessToken();

        if (!token) {
            throw new Error('Unable to retrieve Okta Access Token.')
        }

        return token.startsWith('Bearer ') ? token : 'Bearer ' + token;
    },[okta?.oktaAuth]);
}
