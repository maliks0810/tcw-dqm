//Tries to parse an error object that may be an Apollo error and contain
//graphQLErrors.

import { ApolloError } from '@apollo/client';

// Loose shape of a GraphQL-error extensions.response payload — the
// server can attach an arbitrary body but we only care about surfacing
// its string form as the Error message. Kept optional/unknown so we
// never assume more than what we're about to use.
type ResponseWithBody = { body?: unknown };

export const parseApolloErrors = (err: Error): Error | AggregateError => {
    //We only care about Apollo errors
    const apolloError = err as ApolloError

    if (!apolloError || apolloError.graphQLErrors.length < 1) {
        return err;
    }

    return new AggregateError(
        apolloError.graphQLErrors.map((e) => {
            const response = e?.extensions?.response as
                | ResponseWithBody
                | undefined;
            const body = response?.body;
            return new Error(body != null ? String(body) : e.message);
        }),
        err.message
    );
};
