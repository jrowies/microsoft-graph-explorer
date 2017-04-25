// ------------------------------------------------------------------------------
//  Copyright (c) Microsoft Corporation.  All Rights Reserved.  Licensed under the MIT License.  See License in the project root for license information.
// ------------------------------------------------------------------------------

import { NgModule, enableProdMode } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';


import { AppComponent }  from './app.component';
import { MainColumnComponent } from './main-column.component'
import { AuthenticationComponent } from './authentication.component'
import { FormsModule, ReactiveFormsModule  } from '@angular/forms'
import { SidebarComponent } from "./sidebar.component";
import { QueryRowComponent } from "./queryrow.component";
import { ExplorerOptions } from "./base";
import { HttpModule } from '@angular/http';
import { HistoryRowComponent } from './history-query.component'
import { HistoryPanelComponent } from "./history-panel.component";
import { MethodBadgeComponent } from "./method-badge.component";
import { ResponseStatusBarComponent } from "./response-status-bar.component";
import { SampleCategoriesPanelComponent } from "./sample-categories-panel.component";
import { RequestEditorsComponent } from "./request-editors.component";
import { ShareLinkBtnComponent } from "./share-link-btn.component";
import { ScopesDialogComponent } from "./scopes-dialog.component";
import { GenericDialogComponent } from "./generic-message-dialog.component";
import { TemplateTipComponent } from "./template-tip.component";

@NgModule({
  imports:      [ BrowserModule, FormsModule, ReactiveFormsModule, HttpModule, BrowserAnimationsModule ],
  declarations: [ AppComponent, AuthenticationComponent, SidebarComponent, QueryRowComponent, MainColumnComponent, HistoryRowComponent, HistoryPanelComponent, MethodBadgeComponent, ResponseStatusBarComponent, SampleCategoriesPanelComponent, RequestEditorsComponent, ShareLinkBtnComponent, ScopesDialogComponent, GenericDialogComponent, TemplateTipComponent ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }


// enableProdMode()