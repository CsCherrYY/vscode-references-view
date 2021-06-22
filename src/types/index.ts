/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { SymbolsTree } from '../tree';
import { ContextKey } from '../utils';
import { TypeHierarchyView, TypeItem, TypesTreeInput } from './model';
import { TypeHierarchyItem } from './protocol';

export function register(tree: SymbolsTree, context: vscode.ExtensionContext): void {

	const typeHierarchyContext = new TypeHierarchyContext(context.workspaceState, TypeHierarchyView.Supertype, false);
	const classViewLanguages = ["java"]; // we can put the languageIds which support class view here

	async function showTypeHierarchy() {
		if (vscode.window.activeTextEditor) {
			const location = new vscode.Location(vscode.window.activeTextEditor.document.uri, vscode.window.activeTextEditor.selection.active)
			const items = await Promise.resolve(vscode.commands.executeCommand<TypeHierarchyItem[]>('typeHierarchy.prepare', location));
			if (!items || items.length === 0) {
				return;
			}
			let classViewEnabled = isClassViewSupported();
			for (const item of items) {
				if (item.kind === vscode.SymbolKind.Interface) {
					classViewEnabled = false;
				}
			}
			if (classViewEnabled) {
				typeHierarchyContext.view = TypeHierarchyView.Class;
				typeHierarchyContext.classViewSupport = true;
			} else {
				typeHierarchyContext.classViewSupport = false;
			}
			const input = new TypesTreeInput(location, typeHierarchyContext, items);
			tree.setInput(input);
		}
	};

	async function setTypesView(view: TypeHierarchyView, anchor: TypeItem | unknown) {
		typeHierarchyContext.view = view;

		let newInput: TypesTreeInput | undefined;
		const oldInput = tree.getInput();
		if (anchor instanceof TypeItem) {
			const location = new vscode.Location(vscode.Uri.parse(anchor.item.uri), anchor.item.selectionRange.start);
			const items = await Promise.resolve(vscode.commands.executeCommand<TypeHierarchyItem[]>('typeHierarchy.prepare', location.uri, location.range.start));
			if (!items) {
				return;
			}
			let classViewEnabled = true;
			for (const item of items) {
				if (item.kind === vscode.SymbolKind.Interface) {
					classViewEnabled = false;
				}
			}
			if (classViewEnabled) {
				typeHierarchyContext.classViewSupport = true;
			} else {
				typeHierarchyContext.classViewSupport = false;
			}
			newInput = new TypesTreeInput(location, typeHierarchyContext, items);
		} else if (oldInput instanceof TypesTreeInput) {
			newInput = new TypesTreeInput(oldInput.location, typeHierarchyContext, oldInput.items);
		}
		if (newInput) {
			tree.setInput(newInput);
		}
	}

	function isClassViewSupported() {
		const languageId = vscode.window.activeTextEditor?.document.languageId;
		if (languageId && classViewLanguages.includes(languageId)) {
			typeHierarchyContext.classViewSupport = true;
			return true;
		}
		typeHierarchyContext.classViewSupport = false;
		return false;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('references-view.showTypeHierarchy', showTypeHierarchy),
		vscode.commands.registerCommand('references-view.showSupertypes', (item: TypeItem | unknown) => setTypesView(TypeHierarchyView.Supertype, item)),
		vscode.commands.registerCommand('references-view.showSubtypes', (item: TypeItem | unknown) => setTypesView(TypeHierarchyView.Subtype, item)),
		vscode.commands.registerCommand('references-view.showClassView', (item: TypeItem | unknown) => setTypesView(TypeHierarchyView.Class, item)),
		vscode.commands.registerCommand('references-view.basedOnType', (item: TypeItem | unknown) => setTypesView(typeHierarchyContext.view, item)),
		vscode.commands.registerCommand('references-view.removeTypeItem', removeTypeItem)
	);
}

function removeTypeItem(item: TypeItem | unknown): void {
	if (item instanceof TypeItem) {
		item.remove();
	}
}

export class TypeHierarchyContext {

	private static _viewKey = 'references-view.typeHierarchyView';
	private static _modeKey = 'references-view.classViewSupport';

	private _ctxView = new ContextKey<'supertype' | 'subtype' | 'class'>(TypeHierarchyContext._viewKey);
	private _ctxMode = new ContextKey<boolean>(TypeHierarchyContext._modeKey);

	constructor(
		private _mem: vscode.Memento,
		private _view: TypeHierarchyView = TypeHierarchyView.Subtype,
		private _classViewSupport: boolean = false,
	) {
		this.view = _view;
		this.classViewSupport = _classViewSupport;
	}

	get view() {
		return this._view;
	}

	set view(value: TypeHierarchyView) {
		this._view = value;
		if (this._view === TypeHierarchyView.Supertype) {
			this._ctxView.set('supertype');
		} else if (this._view === TypeHierarchyView.Subtype) {
			this._ctxView.set('subtype');
		} else {
			this._ctxView.set('class');
		}
		this._mem.update(TypeHierarchyContext._viewKey, value);
	}

	get classViewSupport() {
		return this._classViewSupport;
	}

	set classViewSupport(classViewSupport: boolean) {
		this._classViewSupport = classViewSupport;
		this._ctxMode.set(this._classViewSupport);
		this._mem.update(TypeHierarchyContext._modeKey, this._classViewSupport);
	}
}
