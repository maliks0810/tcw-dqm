//Tries to parse an error object that may be an Apollo error and contain
//graphQLErrors.

// Structural shape of the pieces we actually touch on an Apollo error —
// declared locally instead of importing ApolloError / GraphQLError from
// @apollo/client because that named export has moved between v3 minor
// releases (TIME-Next's pinned Apollo Client version doesn't re-export
// ApolloError from the package root, tripping "has no exported member
// ApolloError"). Duck-typing avoids the version coupling entirely
// while still narrowing the two fields we care about.
type ApolloGraphQLError = {
    message: string;
    extensions?: {
        response?: { body?: unknown };
    };
};

type ApolloLikeError = {
    graphQLErrors?: ApolloGraphQLError[];
};

export const parseApolloErrors = (err: Error): Error | AggregateError => {
    //We only care about Apollo errors
    const apolloError = err as unknown as ApolloLikeError;

    if (!apolloError || !apolloError.graphQLErrors || apolloError.graphQLErrors.length < 1) {
        return err;
    }

    return new AggregateError(
        // Explicit param annotation — TIME-Next's tsconfig has
        // noImplicitAny on and the strict setting doesn't infer the
        // callback param from ApolloGraphQLError[] via the guard
        // narrowing above (TS7006). Naming the type explicitly
        // sidesteps the inference gap.
        apolloError.graphQLErrors.map((e: ApolloGraphQLError) => {
            const body = e?.extensions?.response?.body;
            return new Error(body != null ? String(body) : e.message);
        }),
        err.message
    );
};
