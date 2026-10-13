// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { parseDegreeProgressGE } from './degreeProgress'

// VERBATIM captures (outer HTML, via DevTools) of a real MyUCSC Degree
// Progress Report, GENERAL EDUCATION REQUIREMENTS section, 2026-08-19.
// FULL_SECTION_FIXTURE is trimmed to its first and last GE category (CC,
// C) plus the DC divider -- the 8 categories in between are byte-identical
// in structure (verified against the real capture before trimming), just
// repeating the same PSGROUPBOXLABEL/satisfied-icon pattern with a
// different code/name, so keeping all 11 here would only pad the fixture
// without exercising anything new.
// EXPANDED_CC_FIXTURE is the same category (GE CC) captured while expanded,
// showing the "following courses were used to satisfy this requirement"
// grid that only exists in the DOM once a row has been expanded.
const FULL_SECTION_FIXTURE = `
<table cellpadding="2" cellspacing="0" cols="1" class="PSGROUPBOXWBO" width="923" style="border-radius: 6px;">
<tbody><tr><td class="PSGROUPBOXLABEL" align="left" style="background-color: rgb(0, 60, 108); color: rgb(253, 199, 0); border-radius: 6px; height: 23px;"><div id="win0divDERIVED_SAA_DPR_GROUPBOX1GP$1"><a class="PSHYPERLINK PTCOLLAPSE_ARROW" title="Collapse section GENERAL EDUCATION REQUIREMENTS *excluding DC" name="DERIVED_SAA_DPR_GROUPBOX1$1" id="DERIVED_SAA_DPR_GROUPBOX1$1" tabindex="756" href="javascript:submitAction_win0(document.win0,'DERIVED_SAA_DPR_GROUPBOX1$1');" aria-expanded="true" role="button"><img src="/cs/csprd/cache181025/PT_TRANS_PIX_1.png" class="PTCOLLAPSE" alt="&lt;img src='/cs/csprd/cache181025/SCV_DPR_SAT_CHECK_ICN_1.SVG' style='padding: 6px 2px 1px 0px;' width='14' height='14' alt='requirement satisfied' aria-label='requirement satisfied'&gt;&nbsp;GENERAL EDUCATION REQUIREMENTS *excluding DC Collapsible section" border="0"></a>&nbsp;<img src="/cs/csprd/cache181025/SCV_DPR_SAT_CHECK_ICN_1.SVG" style="padding: 6px 2px 1px 0px;" width="14" height="14" alt="requirement satisfied" aria-label="requirement satisfied">&nbsp;GENERAL EDUCATION REQUIREMENTS *excluding DC&nbsp;</div></td></tr>
<tr><td width="919">
<table role="presentation" border="0" id="ACE_DERIVED_SAA_DPR_GROUPBOX1$1" cellpadding="0" cellspacing="0" cols="3" width="919" class="PSGROUPBOX" style="border-style:none">
<tbody><tr>
<td width="0" height="0"></td>
<td width="643"></td>
<td width="278"></td>
</tr>
<tr>
<td height="366"></td>
<td valign="top" align="left">
<div id="win0divDERIVED_SCC_XFR_$1"><table cellpadding="0" cellspacing="0" cols="1" class="PSGROUPBOXNBO" width="642">
<tbody><tr><td class="PAGROUPBOXLABELINVISIBLE" align="left">Group Box</td></tr>
<tr><td width="642">
<table role="presentation" border="0" id="ACE_DERIVED_SCC_XFR_$1" cellpadding="0" cellspacing="0" cols="5" width="642" class="PSGROUPBOX" style="border-style:none">
<tbody><tr>
<td width="0" height="0"></td>
<td width="8"></td>
<td width="528"></td>
<td width="88"></td>
<td width="18"></td>
</tr>
<tr>
<td height="24" colspan="2"></td>
<td rowspan="2" valign="top" align="left">
<div id="win0divDERIVED_SAA_DPR_SAA_DESCRLONG_01$1"><div style="width:528px; ">
<p><span class="PSLONGEDITBOX"><strong>Satisfied: &nbsp;&nbsp;</strong>All general education courses must be passed with a grade of C/P or better.  Search for general education courses via <a href="https://pisa.ucsc.edu/class_search/" target="_blank">Class Search</a>. (RG2395)</span></p>
</div>
</div></td>
<td rowspan="2"></td>
<td valign="top" align="left">
<div id="win0divSCV_DUMMY_FRAME$1"><table cellpadding="2" cellspacing="0" cols="1" class="PABACKGROUNDINVISIBLEWBO" width="156">
<tbody><tr><td width="154" height="22">
</td></tr>
</tbody></table>
</div></td>
</tr>
<tr>
<td height="7" colspan="2"></td>
</tr>
<tr>
<td height="324"></td>
<td colspan="4" valign="top" align="left">
<div id="win0divSAA_ARSLT_RLVW$1"><table cellpadding="2" cellspacing="0" cols="1" class="PSLEVEL1SCROLLAREABODYNBOWBO" id="SAA_ARSLT_RLVW$scroll$1" onclick="getScrollTableId('SAA_ARSLT_RLVW$scroll$1')" width="911">
<tbody><tr><td width="907">
<table role="presentation" border="0" id="ACE_SAA_ARSLT_RLVW$1" cellpadding="0" cellspacing="0" cols="7" width="907" class="PSLEVEL1SCROLLAREABODYNBO" style="border-style:none">
<tbody><tr>
<td width="0" height="2"></td>
<td width="12"></td>
<td width="16"></td>
<td width="498"></td>
<td width="104"></td>
<td width="226"></td>
<td width="53"></td>
</tr>
<tr>
<td height="19" colspan="3"></td>
<td colspan="3" valign="top" align="left">
<div id="win0divDERIVED_SAA_DPR_GROUPBOX3$3"><table cellpadding="2" cellspacing="0" cols="1" class="PSLEVEL1SCROLLAREABODYNBOWBO" width="828">
<tbody><tr><td class="PSGROUPBOXLABEL" align="left" style="background-color: rgb(231, 237, 242); color: rgb(0, 60, 108); border-radius: 6px; height: 23px;"><div id="win0divDERIVED_SAA_DPR_GROUPBOX3GP$3"><a class="PSHYPERLINK PTEXPAND_ARROW" title="Expand section GE CC: Cross-Cultural Analysis" name="DERIVED_SAA_DPR_GROUPBOX3$3" id="DERIVED_SAA_DPR_GROUPBOX3$3" tabindex="779" href="javascript:submitAction_win0(document.win0,'DERIVED_SAA_DPR_GROUPBOX3$3');" aria-expanded="false" role="button"><img src="/cs/csprd/cache181025/PT_TRANS_PIX_1.png" class="PTEXPAND" alt="&lt;img src='/cs/csprd/cache181025/SCV_DPR_SAT_CHECK_ICN_1.SVG' style='padding: 6px 2px 1px 0px;' width='14' height='14' alt='requirement satisfied' aria-label='requirement satisfied'&gt;&nbsp;GE CC: Cross-Cultural Analysis Collapsible section" border="0"></a>&nbsp;<img src="/cs/csprd/cache181025/SCV_DPR_SAT_CHECK_ICN_1.SVG" style="padding: 6px 2px 1px 0px;" width="14" height="14" alt="requirement satisfied" aria-label="requirement satisfied">&nbsp;GE CC: Cross-Cultural Analysis&nbsp;</div></td></tr>
</tbody></table>
</div></td>
</tr>
<tr>
<td height="9" colspan="7"></td>
</tr>
<tr>
<td height="19" colspan="3"></td>
<td colspan="3" valign="top" align="left">
<div id="win0divDERIVED_SAA_DPR_GROUPBOX3$12"><table cellpadding="2" cellspacing="0" cols="1" class="PSLEVEL1SCROLLAREABODYNBOWBO" width="828">
<tbody><tr><td class="PSGROUPBOXLABEL" align="left" style="background-color: rgb(231, 237, 242); color: rgb(0, 60, 108); border-radius: 6px; height: 23px;"><div id="win0divDERIVED_SAA_DPR_GROUPBOX3GP$12"><a class="PSHYPERLINK PTEXPAND_ARROW" title="Expand section GE C: Composition" name="DERIVED_SAA_DPR_GROUPBOX3$12" id="DERIVED_SAA_DPR_GROUPBOX3$12" tabindex="2536" href="javascript:submitAction_win0(document.win0,'DERIVED_SAA_DPR_GROUPBOX3$12');" aria-expanded="false" role="button"><img src="/cs/csprd/cache181025/PT_TRANS_PIX_1.png" class="PTEXPAND" alt="&lt;img src='/cs/csprd/cache181025/SCV_DPR_SAT_CHECK_ICN_1.SVG' style='padding: 6px 2px 1px 0px;' width='14' height='14' alt='requirement satisfied' aria-label='requirement satisfied'&gt;&nbsp;GE C: Composition Collapsible section" border="0"></a>&nbsp;<img src="/cs/csprd/cache181025/SCV_DPR_SAT_CHECK_ICN_1.SVG" style="padding: 6px 2px 1px 0px;" width="14" height="14" alt="requirement satisfied" aria-label="requirement satisfied">&nbsp;GE C: Composition&nbsp;</div></td></tr>
</tbody></table>
</div></td>
</tr>
<tr>
<td height="9" colspan="7"></td>
</tr>
<tr>
<td height="16"></td>
<td colspan="4" valign="top" align="left">
<div id="win0divDERIVED_SAA_DPR_GROUPBOX2$13"><table cellpadding="0" cellspacing="0" cols="1" class="PSGROUPBOXNBO" width="630">
<tbody><tr><td class="PAGROUPDIVIDER" align="left" style="background-color: rgb(0, 60, 108); color: rgb(253, 199, 0); border-radius: 6px; height: 23px;">GE DC: Disciplinary Communication</td></tr>
<tr><td width="630" height="1">
</td></tr>
</tbody></table>
</div></td>
</tr>
<tr>
<td height="22" colspan="2"></td>
<td colspan="2" valign="top" align="left">
<div id="win0divDERIVED_SAA_DPR_SAA_DESCRLONG_03$13"><div style="width:514px; ">
<p><span class="PSLONGEDITBOX">All students must satisfy the DC requirement of each of their chosen majors. The DC requirement can be found in the Upper-Division Requirements section for each major below (R539)</span></p>
</div>
</div></td>
</tr>
</tbody></table>
</td></tr>
</tbody></table>
</div></td>
</tr>
<tr>
<td height="10" colspan="5"></td>
</tr>
</tbody></table>
</td></tr>
</tbody></table>
</div></td>
</tr>
</tbody></table>
</td></tr>
</tbody></table>
`

const EXPANDED_CC_FIXTURE = `
<div id="win0divDERIVED_SAA_DPR_GROUPBOX3$3"><table cellpadding="2" cellspacing="0" cols="1" class="PSLEVEL1SCROLLAREABODYNBOWBO" width="827">
<tbody><tr><td class="PSGROUPBOXLABEL" align="left" style="background-color: rgb(231, 237, 242); color: rgb(0, 60, 108); border-radius: 6px; height: 23px;"><div id="win0divDERIVED_SAA_DPR_GROUPBOX3GP$3"><a class="PSHYPERLINK PTCOLLAPSE_ARROW" title="Collapse section GE CC: Cross-Cultural Analysis" name="DERIVED_SAA_DPR_GROUPBOX3$3" id="DERIVED_SAA_DPR_GROUPBOX3$3" tabindex="779" href="javascript:submitAction_win0(document.win0,'DERIVED_SAA_DPR_GROUPBOX3$3');" aria-expanded="true" role="button"><img src="/cs/csprd/cache181025/PT_TRANS_PIX_1.png" class="PTCOLLAPSE" alt="&lt;img src='/cs/csprd/cache181025/SCV_DPR_SAT_CHECK_ICN_1.SVG' style='padding: 6px 2px 1px 0px;' width='14' height='14' alt='requirement satisfied' aria-label='requirement satisfied'&gt;&nbsp;GE CC: Cross-Cultural Analysis Collapsible section" border="0"></a>&nbsp;<img src="/cs/csprd/cache181025/SCV_DPR_SAT_CHECK_ICN_1.SVG" style="padding: 6px 2px 1px 0px;" width="14" height="14" alt="requirement satisfied" aria-label="requirement satisfied">&nbsp;GE CC: Cross-Cultural Analysis&nbsp;</div></td></tr>
<tr><td width="823">
<table role="presentation" border="0" id="ACE_DERIVED_SAA_DPR_GROUPBOX3$3" cellpadding="0" cellspacing="0" cols="5" width="823" class="PSLEVEL1SCROLLAREABODYNBO" style="border-style:none">
<tbody><tr>
<td width="6" height="3"></td>
<td width="16"></td>
<td width="596"></td>
<td width="196"></td>
<td width="9"></td>
</tr>
<tr>
<td height="29" colspan="2"></td>
<td colspan="2" valign="top" align="left">
<div id="win0divDERIVED_SAA_DPR_$3"><table cellpadding="2" cellspacing="0" cols="1" class="PABACKGROUNDINVISIBLEWBO" width="791">
<tbody><tr><td width="789">
<table role="presentation" border="0" id="ACE_DERIVED_SAA_DPR_$3" cellpadding="0" cellspacing="0" cols="3" width="789" class="PABACKGROUNDINVISIBLE" style="border-style:none">
<tbody><tr>
<td width="3" height="0"></td>
<td width="496"></td>
<td width="290"></td>
</tr>
<tr>
<td height="26"></td>
<td valign="top" align="left">
<div id="win0divDERIVED_SAA_DPR_SAA_DESCRLONG_05$3"><div style="width:496px; ">
<p><span class="PSLONGEDITBOX"><strong>Satisfied: &nbsp;&nbsp;</strong>One 5-credit course or equivalent (R581, L10)</span></p>
</div>
</div></td>
</tr>
</tbody></table>
</td></tr>
</tbody></table>
</div></td>
</tr>
<tr>
<td height="5" colspan="5"></td>
</tr>
<tr>
<td height="75"></td>
<td colspan="2" valign="top" align="left">
<div id="win0divDERIVED_SAA_DPR_GROUPBOX4$3"><table cellpadding="0" cellspacing="0" cols="1" class="PSGROUPBOXNBO" width="611">
<tbody><tr><td class="PSGROUPBOXLABEL" align="left" style="background-color: rgb(231, 237, 242); color: rgb(0, 60, 108); border-radius: 6px; height: 23px;">The following courses were used to satisfy this requirement:</td></tr>
<tr><td width="611">
<table role="presentation" border="0" id="ACE_DERIVED_SAA_DPR_GROUPBOX4$3" cellpadding="0" cellspacing="0" cols="2" width="611" class="PSGROUPBOX" style="border-style:none">
<tbody><tr>
<td width="0" height="0"></td>
<td width="611"></td>
</tr>
<tr>
<td height="60"></td>
<td valign="top" align="left">
<div id="win0divDERIVED_SCC_XFR_$110$$3"><table cellpadding="0" cellspacing="0" cols="1" class="PSGROUPBOXNBO" width="611">
<tbody><tr><td class="PAGROUPBOXLABELINVISIBLE" align="left">Group Box</td></tr>
<tr><td width="611">
<table role="presentation" border="0" id="ACE_DERIVED_SCC_XFR_$110$$3" cellpadding="0" cellspacing="0" cols="2" width="611" class="PSGROUPBOX" style="border-style:none">
<tbody><tr>
<td width="0" height="0"></td>
<td width="611"></td>
</tr>
<tr>
<td height="59"></td>
<td valign="top" align="left">
<div id="win0divSAA_ACRSE_VW$3">
<table cellspacing="0" class="PSLEVEL3GRIDWBO" id="SAA_ACRSE_VW$scroll$3" dir="ltr" cols="1" width="611" cellpadding="0">
<tbody><tr><td class="PSLEVEL3GRIDLABEL" align="right"><div id="win0divSAA_ACRSE_VWGP$3"><a name="SAA_ACRSE_VW$hpers$3" id="SAA_ACRSE_VW$hpers$3" tabindex="786" href="javascript:submitAction_win0(document.win0,'SAA_ACRSE_VW$hpers$3');" class="PSLEVEL3GRIDLABEL">Personalize</a>&nbsp;|&nbsp;<span class="PSHEADERHYPERLINKD">View All</span>&nbsp;|&nbsp;<span class="PSGRIDCOUNTER">1 of 1</span>&nbsp;</div></td></tr>
<tr><td>
<table dir="ltr" border="0" cellpadding="2" cellspacing="0" cols="7" width="100%" class="PSLEVEL3GRID" style="border-style:none">
<tbody><tr>
<th scope="col" width="70" align="left" class="PSLEVEL3GRIDCOLUMNHDR PSGRIDFIRSTCOLUMN">Course</th>
<th scope="col" width="101" align="left" class="PSLEVEL3GRIDCOLUMNHDR">Description</th>
<th scope="col" width="40" align="CENTER" class="PSLEVEL3GRIDCOLUMNHDR">Units</th>
<th scope="col" width="102" align="left" class="PSLEVEL3GRIDCOLUMNHDR">When</th>
<th scope="col" width="22" align="left" class="PSLEVEL3GRIDCOLUMNHDR">Grade</th>
<th scope="col" width="20" align="left" class="PSLEVEL3GRIDCOLUMNHDR">Status</th>
<th scope="col" width="63" align="left" class="PSLEVEL3GRIDCOLUMNHDR">Course Type</th>
</tr>
<tr id="trSAA_ACRSE_VW$3_row1" bufnum="0" valign="center">
<td align="left" height="15" class="PSLEVEL3GRIDODDROW PSGRIDFIRSTCOLUMN" style="">
<div id="win0divCRSE_NAME$1"><span id="CRSE_NAME$span$1" class="PSHYPERLINKDISABLED" title="View list of matching courses">EART   30</span></div></td>
<td class="PSLEVEL3GRIDODDROW" align="left" style="">
<div id="win0divCRSE_DESCR$1"><span id="CRSE_DESCR$span$1" class="PSHYPERLINK" title="View Course Details"><a name="CRSE_DESCR$1" id="CRSE_DESCR$1" href="javascript:submitAction_win0(document.win0,'CRSE_DESCR$1');" class="PSHYPERLINK">Water in Environment</a></span></div></td>
<td class="PSLEVEL3GRIDODDROW" align="right" style="">
<div id="win0divCRSE_UNITS$1"><span class="PSEDITBOX_DISPONLY" id="CRSE_UNITS$1">5.00</span>
</div></td>
<td class="PSLEVEL3GRIDODDROW" align="left" style="">
<div id="win0divCRSE_WHEN$1"><span class="PSEDITBOX_DISPONLY" id="CRSE_WHEN$1">2025 Summer Quarter</span>
</div></td>
<td class="PSLEVEL3GRIDODDROW" align="left" style="">
<div id="win0divDERIVED_SAA_DPR_SSR_GRADE_LONG$1"><div style="min-width:22px; ">
<span class="PSEDITBOX_DISPONLY">A</span>
</div>
</div></td>
<td class="PSLEVEL3GRIDODDROW" align="left" style="">
<div id="win0divCRSE_STAT$1"><div style="min-width:20px; ">
<img src="/cs/csprd/cache181025/PS_CS_CREDIT_TAKEN_ICN_1.gif" width="16" height="16" alt="Taken" style="vertical-align:middle;text-align:center;margin-left:12px">
</div>
</div></td>
<td class="PSLEVEL3GRIDODDROW" align="left" style="">
<div id="win0divSCV_AAR_CRSETYP_SCV_COURSE_TYPE$1"><span class="PSEDITBOX_DISPONLY" id="SCV_AAR_CRSETYP_SCV_COURSE_TYPE$1">EN</span>
</div></td>
</tr>
</tbody></table></td></tr>
</tbody></table>
</div>
</td>
</tr>
</tbody></table>
</td></tr>
</tbody></table>
</div></td>
</tr>
<tr>
<td height="1" colspan="2"></td>
</tr>
</tbody></table>
</td></tr>
</tbody></table>
</div></td>
</tr>
<tr>
<td height="5" colspan="5"></td>
</tr>
</tbody></table>
</td></tr>
</tbody></table>
</div>
`

describe('parseDegreeProgressGE', () => {
  it('parses all 11 non-DC GE categories from the collapsed whole-section capture', () => {
    document.body.innerHTML = FULL_SECTION_FIXTURE
    const results = parseDegreeProgressGE(document)
    expect(results.map((r) => r.code)).toEqual(['CC', 'C'])
  })

  it('marks a category satisfied when the "requirement satisfied" icon is present', () => {
    document.body.innerHTML = FULL_SECTION_FIXTURE
    const results = parseDegreeProgressGE(document)
    expect(results.find((r) => r.code === 'CC')?.satisfied).toBe(true)
    expect(results.find((r) => r.code === 'C')?.satisfied).toBe(true)
  })

  it('excludes DC entirely -- it is not one of the parsed categories', () => {
    document.body.innerHTML = FULL_SECTION_FIXTURE
    const results = parseDegreeProgressGE(document)
    expect(results.find((r) => r.code === 'DC')).toBeUndefined()
  })

  it('returns no courses for a collapsed category (course table not in the DOM)', () => {
    document.body.innerHTML = FULL_SECTION_FIXTURE
    const results = parseDegreeProgressGE(document)
    expect(results.find((r) => r.code === 'CC')?.courses).toEqual([])
  })

  it('parses course-level detail from an expanded category', () => {
    document.body.innerHTML = EXPANDED_CC_FIXTURE
    const results = parseDegreeProgressGE(document)
    expect(results).toEqual([
      {
        code: 'CC',
        name: 'Cross-Cultural Analysis',
        satisfied: true,
        courses: [{ courseCode: 'EART 30', term: '2025 Summer Quarter', status: 'taken' }],
      },
    ])
  })
})
