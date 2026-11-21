import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { app: string } }
) {
  const app = params.app?.toLowerCase();
  if (app !== "excel" && app !== "outlook") {
    return new NextResponse("Not Found. Specify /api/office/manifest/excel or /api/office/manifest/outlook", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Determine host dynamically from request, defaulting to production URL
  const origin = req.nextUrl.origin || "https://cortex.mnbresearch.com";

  if (app === "excel") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp
  xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
  xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"
  xsi:type="TaskpaneApp">

  <Id>c817e042-494b-4fc4-8d7d-5cb90861c8a1</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>MNB Research</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="MNB Cortex for Excel" />
  <Description DefaultValue="Autonomous finance, Big-4 forensic audit sentinel, and ledger intelligence directly inside Microsoft Excel." />
  <IconUrl DefaultValue="${origin}/icon-32.png" />
  <HighResolutionIconUrl DefaultValue="${origin}/icon-128.png" />
  <SupportUrl DefaultValue="${origin}/support" />

  <AppDomains>
    <AppDomain>${origin}</AppDomain>
    <AppDomain>https://cortex.mnbresearch.com</AppDomain>
    <AppDomain>https://mnbresearch.com</AppDomain>
  </AppDomains>

  <Hosts>
    <Host Name="Workbook" />
  </Hosts>

  <DefaultSettings>
    <SourceLocation DefaultValue="${origin}/office/excel" />
  </DefaultSettings>

  <Permissions>ReadWriteDocument</Permissions>

  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Workbook">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GetStarted.Title"/>
            <Description resid="GetStarted.Desc"/>
            <LearnMoreUrl resid="GetStarted.LearnMoreUrl"/>
          </GetStarted>
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <CustomTab id="MNB.Cortex.Tab">
              <Group id="MNB.Cortex.Group">
                <Label resid="Group.Label" />
                <Icon>
                  <bt:Image size="16" resid="Icon.16" />
                  <bt:Image size="32" resid="Icon.32" />
                  <bt:Image size="80" resid="Icon.80" />
                </Icon>
                <Control xsi:type="Button" id="MNB.Cortex.TaskpaneBtn">
                  <Label resid="Btn.Label" />
                  <Supertip>
                    <Title resid="Btn.Label" />
                    <Description resid="Btn.Tooltip" />
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16" />
                    <bt:Image size="32" resid="Icon.32" />
                    <bt:Image size="80" resid="Icon.80" />
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>MNB.Cortex.ExcelTaskpane</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url" />
                  </Action>
                </Control>
              </Group>
              <Label resid="Tab.Label" />
            </CustomTab>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>
    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16" DefaultValue="${origin}/icon-16.png" />
        <bt:Image id="Icon.32" DefaultValue="${origin}/icon-32.png" />
        <bt:Image id="Icon.80" DefaultValue="${origin}/icon-80.png" />
      </bt:Images>
      <bt:Urls>
        <bt:Url id="GetStarted.LearnMoreUrl" DefaultValue="${origin}/integrations/office" />
        <bt:Url id="Taskpane.Url" DefaultValue="${origin}/office/excel" />
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="GetStarted.Title" DefaultValue="MNB Cortex Loaded" />
        <bt:String id="Group.Label" DefaultValue="MNB Cortex" />
        <bt:String id="Btn.Label" DefaultValue="Cortex Copilot" />
        <bt:String id="Tab.Label" DefaultValue="Cortex" />
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="GetStarted.Desc" DefaultValue="Cortex Financial Copilot &amp; Forensic Audit Sentinel is ready to analyze your workbook." />
        <bt:String id="Btn.Tooltip" DefaultValue="Open the MNB Cortex autonomous financial &amp; audit taskpane" />
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>`;

    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  // Outlook manifest
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OfficeApp
  xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
  xmlns:mailappor="http://schemas.microsoft.com/office/mailappversionoverrides"
  xsi:type="MailApp">

  <Id>d928f153-505c-4da5-9e8e-6dc01972d9b2</Id>
  <Version>1.0.0.0</Version>
  <ProviderName>MNB Research</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="MNB Cortex for Outlook" />
  <Description DefaultValue="Contextual ledger intelligence, customer 43B(h) exposure, and 1-click verified payment requests in Outlook." />
  <IconUrl DefaultValue="${origin}/icon-32.png" />
  <HighResolutionIconUrl DefaultValue="${origin}/icon-128.png" />
  <SupportUrl DefaultValue="${origin}/support" />

  <AppDomains>
    <AppDomain>${origin}</AppDomain>
    <AppDomain>https://cortex.mnbresearch.com</AppDomain>
    <AppDomain>https://mnbresearch.com</AppDomain>
  </AppDomains>

  <Hosts>
    <Host Name="Mailbox" />
  </Hosts>

  <Requirements>
    <Sets>
      <Set Name="Mailbox" MinVersion="1.5" />
    </Sets>
  </Requirements>

  <FormSettings>
    <Form xsi:type="ItemRead">
      <DesktopSettings>
        <SourceLocation DefaultValue="${origin}/office/outlook" />
        <RequestedHeight>450</RequestedHeight>
      </DesktopSettings>
    </Form>
    <Form xsi:type="ItemEdit">
      <DesktopSettings>
        <SourceLocation DefaultValue="${origin}/office/outlook" />
      </DesktopSettings>
    </Form>
  </FormSettings>

  <Permissions>ReadWriteItem</Permissions>

  <Rule xsi:type="RuleCollection" Mode="Or">
    <Rule xsi:type="ItemIs" ItemType="Message" FormType="Read" />
    <Rule xsi:type="ItemIs" ItemType="Message" FormType="Edit" />
  </Rule>

  <DisableEntityHighlighting>false</DisableEntityHighlighting>

  <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides" xsi:type="VersionOverridesV1_0">
    <VersionOverrides xmlns="http://schemas.microsoft.com/office/mailappversionoverrides/1.1" xsi:type="VersionOverridesV1_1">
      <Requirements>
        <bt:Sets DefaultMinVersion="1.5">
          <bt:Set Name="Mailbox" />
        </bt:Sets>
      </Requirements>
      <Hosts>
        <Host xsi:type="MailHost">
          <DesktopModelSurface>
            <ExtensionPoint xsi:type="MessageReadCommandSurface">
              <OfficeTab id="TabDefault">
                <Group id="msgReadGroup">
                  <Label resid="Group.Label" />
                  <Control xsi:type="Button" id="msgReadOpenTaskpane">
                    <Label resid="Btn.Label" />
                    <Supertip>
                      <Title resid="Btn.Label" />
                      <Description resid="Btn.Tooltip" />
                    </Supertip>
                    <Icon>
                      <bt:Image size="16" resid="Icon.16" />
                      <bt:Image size="32" resid="Icon.32" />
                      <bt:Image size="80" resid="Icon.80" />
                    </Icon>
                    <Action xsi:type="ShowTaskpane">
                      <SourceLocation resid="Taskpane.Url" />
                    </Action>
                  </Control>
                </Group>
              </OfficeTab>
            </ExtensionPoint>
            <ExtensionPoint xsi:type="MessageComposeCommandSurface">
              <OfficeTab id="TabDefault">
                <Group id="msgComposeGroup">
                  <Label resid="Group.Label" />
                  <Control xsi:type="Button" id="msgComposeOpenTaskpane">
                    <Label resid="Btn.Label" />
                    <Supertip>
                      <Title resid="Btn.Label" />
                      <Description resid="Btn.Tooltip" />
                    </Supertip>
                    <Icon>
                      <bt:Image size="16" resid="Icon.16" />
                      <bt:Image size="32" resid="Icon.32" />
                      <bt:Image size="80" resid="Icon.80" />
                    </Icon>
                    <Action xsi:type="ShowTaskpane">
                      <SourceLocation resid="Taskpane.Url" />
                    </Action>
                  </Control>
                </Group>
              </OfficeTab>
            </ExtensionPoint>
          </DesktopModelSurface>
        </Host>
      </Hosts>
      <Resources>
        <bt:Images>
          <bt:Image id="Icon.16" DefaultValue="${origin}/icon-16.png" />
          <bt:Image id="Icon.32" DefaultValue="${origin}/icon-32.png" />
          <bt:Image id="Icon.80" DefaultValue="${origin}/icon-80.png" />
        </bt:Images>
        <bt:Urls>
          <bt:Url id="Taskpane.Url" DefaultValue="${origin}/office/outlook" />
        </bt:Urls>
        <bt:ShortStrings>
          <bt:String id="Group.Label" DefaultValue="MNB Cortex" />
          <bt:String id="Btn.Label" DefaultValue="Cortex Intelligence" />
        </bt:ShortStrings>
        <bt:LongStrings>
          <bt:String id="Btn.Tooltip" DefaultValue="View customer ledger, 43B(h) exposure, and insert verified payment requests" />
        </bt:LongStrings>
      </Resources>
    </VersionOverrides>
  </VersionOverrides>
</OfficeApp>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
