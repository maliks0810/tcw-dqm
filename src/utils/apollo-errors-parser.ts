//Tries to parse an error object that may be an Apollo error and contain
//graphQLErrors.

import { ApolloError } from '@apollo/client';

export const parseApolloErrors = (err: Error): Error | AggregateError => {
    //We only care about Apollo errors
    const apolloError = err as ApolloError

    if (!apolloError || apolloError.graphQLErrors.length < 1) {
        return err;
    }

    return new AggregateError(
        apolloError.graphQLErrors.map(
            (e) =>
                new Error(
                    (e?.extensions?.response as any)?.body
                        ? (e?.extensions?.response as any).body
                        : e.message
                )
        ),
        err.message
    );
};
