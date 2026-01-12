import {
    DocumentNode,
    OperationVariables,
    TypedDocumentNode,
    useApolloClient,
} from '@apollo/client';
import { useCallback } from 'react';
import { parseApolloErrors } from '../utils/apollo-errors-parser';
import { useBearerToken } from './bearer-token';

/**
 * # useBasicGQLOperation
 * Custom hook that performs a basic Apollo Client query or mutate.
 * This hook will determine if a query or mutate operation should be
 * performed based on the document passed in. Currently, only query
 * and mutation are supported.
 *
 * This hook assumes basic options for queries and mutations,
 * including no error policy, a context that only includes headers,
 * and only Authorization in the headers (if required), and an
 * optional index list of variables.
 *
 * This hook returns an async function that can be called with all
 * of the options to perform a query or mutation. This hook does not
 * need to be recreated to call different queries or mutations. The
 * function returns a promise containing the results of the
 * operation or throws an error. This error should be handled in the
 * `.catch` block of the returned promise.
 *
 * @returns an anonymous async function that can be called to run a
 *  query or mutation.
 *
 * # returned anonymous async function
 * This is the returned function that can be called to run a query
 * or mutation. This function can be reused indefinitely on
 * different queries or mutations without needing to be recreated.
 * This function returns a promise containing the result of the
 * operation. If an error is thrown within this function, it should
 * be handled in the promise's `.catch` block.
 *
 * This function uses the `parseApolloErrors` utility function to
 * deconstruct `ApolloError`-type errors. If the error is of type
 * `ApolloError`, it will be converted into an
 * `AggregateError` before being rethrown. Otherwise the original
 * error will be rethrown.
 *
 * @param {DocumentNode | TypedDocumentNode<TData, TVariables>} document
 *  - the query or mutation to run
 * @param {{ [x: string]: any }} variables
 *  - optional index list for variables to pass to the query or mutation
 * @param { boolean } includeBearerToken
 *  - optional boolean. If true, the bearer token will be included in the
 *  headers of the operation. This token is obtained from the Okta Access
 *  Token using the `useBearerToken` hook.
 * @returns { Promise<any> } The result of the query or mutation
 */
export const useBasicGQLOperation = (): (<
    TData = any,
    TVariables extends OperationVariables = OperationVariables
>(
    document: DocumentNode | TypedDocumentNode<TData, TVariables>,
    variables?: { [x: string]: any },
    includeBearerToken?: boolean
) => Promise<any>) => {
    const { query: apolloQuery, mutate: apolloMutate } = useApolloClient();
    const getToken = useBearerToken();

    return useCallback(
        async <TData = any, TVariables extends OperationVariables = OperationVariables>(
            document: DocumentNode | TypedDocumentNode<TData, TVariables>,
            variables?: { [x: string]: any },
            includeBearerToken?: boolean
        ) => {
            const docType = (document.definitions[0] as any).operation;

            if (docType != 'query' && docType != 'mutation') {
                throw Error('operation document must be a query or a mutation');
            }

            const operationOptions: any = {
                variables: variables,
                errorPolicy: 'none',
                fetchPolicy: 'no-cache',
                context: {
                    headers: includeBearerToken
                        ? {
                              Authorization: await getToken(),
                          }
                        : {},
                },
            };

            operationOptions[docType] = document;

            const operationPromise =
                docType == 'query' ? apolloQuery(operationOptions) : apolloMutate(operationOptions);

            let response;

            await operationPromise
                .then((raw) => {
                    response = raw;
                })
                .catch((err) => {
                    throw parseApolloErrors(err);
                });

            return response;
        },
        [apolloMutate, apolloQuery, getToken]
    );
};
