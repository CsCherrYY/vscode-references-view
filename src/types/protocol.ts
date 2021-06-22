/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from "vscode";

export declare type DocumentUri = string;

export interface TypeHierarchyItem {
    /**
     * The name of this item.
     */
    name: string;
    /**
     * The kind of this item.
     */
    kind: vscode.SymbolKind;
    /**
     * Tags for this item.
     */
    tags?: vscode.SymbolTag[];
    /**
     * More detail for this item, e.g. the signature of a function.
     */
    detail?: string;
    /**
     * The resource identifier of this item.
     */
    uri: DocumentUri;
    /**
     * The range enclosing this symbol not including leading/trailing whitespace
     * but everything else, e.g. comments and code.
     */
    range: vscode.Range;
    /**
     * The range that should be selected and revealed when this symbol is being
     * picked, e.g. the name of a function. Must be contained by the
     * [`range`](#TypeHierarchyItem.range).
     */
    selectionRange: vscode.Range;
    /**
     * A data entry field that is preserved between a type hierarchy prepare and
     * supertypes or subtypes requests. It could also be used to identify the
     * type hierarchy in the server, helping improve the performance on
     * resolving supertypes and subtypes.
     */
    data?: unknown;
}
