/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { TypeHierarchyContext } from '.';
import { SymbolItemEditorHighlights, SymbolItemNavigation, SymbolTreeInput } from '../references-view';
import { del, getThemeIcon, tail } from '../utils';
import { TypeHierarchyItem } from './protocol';


export class TypesTreeInput implements SymbolTreeInput<TypeItem> {

	readonly title: string;
	readonly contextValue: string = 'typeHierarchy';
	readonly items: TypeHierarchyItem[];

	constructor(
		readonly location: vscode.Location,
		readonly typeHierarchyContext: TypeHierarchyContext,
		items: TypeHierarchyItem[],
	) {
		if (typeHierarchyContext.view === TypeHierarchyView.Supertype) {
			this.title = 'Supertype Hierarchy';
		} else if (typeHierarchyContext.view === TypeHierarchyView.Subtype) {
			this.title = 'Subtype Hierarchy';
		} else if (typeHierarchyContext.view === TypeHierarchyView.Class) {
			this.title = 'Class Hierarchy';
		} else {
			this.title = 'Invalid Type Hierarchy View';
		}
		this.items = items;
	}

	async resolve() {

		const model = new TypesModel(this.typeHierarchyContext.view, this.items ?? []);
		const provider = new TypeItemDataProvider(model);

		if (model.roots.length === 0) {
			return;
		}

		return {
			provider,
			get message() { return model.roots.length === 0 ? 'No results.' : undefined; },
			navigation: model,
			highlights: model,
			dispose() {
				provider.dispose();
			}
		};
	}

	with(location: vscode.Location): TypesTreeInput {
		return new TypesTreeInput(location, this.typeHierarchyContext, this.items);
	}
}

export const enum TypeHierarchyView {
	Supertype,
	Subtype,
	Class,
}

export class TypeItem {

	children?: TypeItem[];
	parent?: TypeItem;
	expand?: boolean;

	constructor(
		readonly model: TypesModel,
		readonly item: TypeHierarchyItem,
		parent: TypeItem | undefined,
	) {
		this.parent = parent;
	}

	remove(): void {
		this.model.remove(this);
	}
}

class TypesModel implements SymbolItemNavigation<TypeItem>, SymbolItemEditorHighlights<TypeItem> {

	readonly roots: TypeItem[] = [];
	private cancelTokenSource = new vscode.CancellationTokenSource();

	private readonly _onDidChange = new vscode.EventEmitter<TypesModel>();
	readonly onDidChange = this._onDidChange.event;

	constructor(readonly view: TypeHierarchyView, items: TypeHierarchyItem[]) {
		this.roots = items.map(item => new TypeItem(this, item, undefined));
	}

	private async _resolveTypes(type: TypeItem): Promise<TypeItem[]> {
		let types = (this.view === TypeHierarchyView.Supertype)
			? await vscode.commands.executeCommand<TypeHierarchyItem[]>('typeHierarchy.supertypes', type.item, this.cancelTokenSource.token)
			: await vscode.commands.executeCommand<TypeHierarchyItem[]>('typeHierarchy.subtypes', type.item, this.cancelTokenSource.token);
		if (!types) {
			return [];
		}
		types = types.sort((a, b) => {
			return (a.kind.toString() === b.kind.toString()) ? a.name.localeCompare(b.name) : b.kind.toString().localeCompare(a.kind.toString());
		});
		return types.map(item => new TypeItem(this, item, type));
	}

	async getTypeChildren(type: TypeItem): Promise<TypeItem[]> {
		if (!type.children) {
			type.children = await this._resolveTypes(type);
		}
		return type.children;
	}

	// -- navigation 

	location(item: TypeItem) {
		return new vscode.Location(vscode.Uri.parse(item.item.uri), item.item.range);
	}

	nearest(uri: vscode.Uri, _position: vscode.Position): TypeItem | undefined {
		return this.roots.find(item => item.item.uri.toString() === uri.toString()) ?? this.roots[0];
	}

	next(from: TypeItem): TypeItem {
		return this._move(from, true) ?? from;
	}

	previous(from: TypeItem): TypeItem {
		return this._move(from, false) ?? from;
	}

	private _move(item: TypeItem, fwd: boolean) {
		if (item.children?.length) {
			return fwd ? item.children[0] : tail(item.children);
		}
		const array = this.roots.includes(item) ? this.roots : item.parent?.children;
		if (array?.length) {
			const idx = array.indexOf(item);
			const delta = fwd ? 1 : -1;
			return array[idx + delta + array.length % array.length];
		}
	}

	getEditorHighlights(item: TypeItem, uri: vscode.Uri): vscode.Range[] | undefined {
		return vscode.Uri.parse(item.item.uri) === uri ? [item.item.selectionRange] : [];
	}

	remove(item: TypeItem) {
		const isInRoot = this.roots.includes(item);
		const siblings = isInRoot ? this.roots : item.parent?.children;
		if (siblings) {
			del(siblings, item);
			this._onDidChange.fire(this);
		}
	}
}

class TypeItemDataProvider implements vscode.TreeDataProvider<TypeItem> {

	private readonly _emitter = new vscode.EventEmitter<TypeItem | undefined>();
	private cancelTokenSource = new vscode.CancellationTokenSource();
	private prefetch: boolean;
	readonly onDidChangeTreeData = this._emitter.event;

	private readonly _modelListener: vscode.Disposable;

	constructor(private _model: TypesModel) {
		this._modelListener = _model.onDidChange(e => this._emitter.fire(e instanceof TypeItem ? e : undefined));
		this.prefetch = vscode.workspace.getConfiguration().get<boolean>("typeHierarchy.prefetch") || false;
	}

	dispose(): void {
		this._emitter.dispose();
		this._modelListener.dispose();
	}

	async getTreeItem(element: TypeItem): Promise<vscode.TreeItem> {

		const item = new vscode.TreeItem(element.item.name);
		item.description = element.item.detail;
		item.contextValue = 'type-item';
		item.iconPath = getThemeIcon(element.item.kind);
		item.command = {
			command: 'vscode.open',
			title: 'Open Type',
			arguments: [
				vscode.Uri.parse(element.item.uri),
				<vscode.TextDocumentShowOptions>{ selection: element.item.selectionRange.with({ end: element.item.selectionRange.start }) }
			]
		};
		if ((this._model.view === TypeHierarchyView.Class && element.expand) || this._model.roots.includes(element)) {
			item.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		} else if (element.children?.length === 0) {
			item.collapsibleState = vscode.TreeItemCollapsibleState.None;
		} else if (!this.prefetch) {
			item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		} else {
			element.children = await this.getChildren(element);
			item.collapsibleState = (element.children.length) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
		}
		return item;
	}

	async getChildren(element?: TypeItem | undefined) {
		if (!element && this._model.view === TypeHierarchyView.Class) {
			for (const root of this._model.roots) {
				if (root.item.kind === vscode.SymbolKind.Class) {
					return [await this.getClassViewRoot(root)];
				}
			}
			return [];
		}
		const children = element ? await this._model.getTypeChildren(element) : this._model.roots;
		if (element && children.length === 0) {
			this._emitter.fire(element);
		}
		return children;
	}

	async getClassViewRoot(rootClass: TypeItem): Promise<TypeItem> {
		rootClass.expand = true;
		const supertypes = await vscode.commands.executeCommand<TypeHierarchyItem[]>('typeHierarchy.supertypes', rootClass.item, this.cancelTokenSource.token);
		if (!supertypes || supertypes.length === 0) {
			return rootClass;
		}
		for (const supertype of supertypes) {
			if (supertype.kind === vscode.SymbolKind.Class) {
				const parentItem = new TypeItem(this._model, supertype, undefined);
				rootClass.parent = parentItem;
				parentItem.children = [rootClass];
				return this.getClassViewRoot(parentItem);
			}
		}
		return rootClass;
	}

	getParent(element: TypeItem) {
		return element.parent;
	}
}
