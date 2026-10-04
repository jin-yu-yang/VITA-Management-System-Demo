# Tax Help Intake Form: Question Design (for Online Form, General Version)

> Source: IRS Form 13614-C (Rev. 10-2025) + Form 15080 (Rev. 10-2025)
> Tax year: **2025**
> Every question includes: English wording, Chinese wording, field ID, input type, and display conditions.
> Content is kept in sync with the senior version; only the wording is more standard.

---

## Design Conventions (for developers)

- **Language level**: Clear, standard wording. Explain tax terms briefly in a Tip when needed.
- **One question per screen or per group**: Don't stack too much on one page.
- **Terms used in Chinese**: "IRS" is written as "国税局（IRS）" the first time on each page, then "国税局". "Spouse" is always "配偶".
- **"Who" multi-select questions**: Many questions ask "you or your spouse". The standard options are:
  - `me` (Me / 本人)
  - `spouse` (My spouse / 配偶), **shown only when married**
  - `none` (No one / 均无), which clears the other two when selected
- **Every Yes/No question** has an extra option: `not_sure` (I'm not sure / 不确定). The volunteer will confirm it in person.
- **Show if** = the question appears only when the condition is met.
- **Upload**: The Tip names the document and says "You will upload it in the Documents step / 您将在「上传文件」步骤上传". All uploads happen in one place.
- Fields on the paper form marked "To be completed by certified volunteer" **do not appear on the public-facing form** (see the appendix).

---

## Section 0: Before You Start / 开始之前

**Page text (no input required):**

> Please have these ready:
> - Tax forms you received, such as **W-2**, **1099**, **1098**, **1095**
> - **Social Security card** or **ITIN letter** for everyone on your tax return
> - **Photo ID** (such as a driver's license) for you and your spouse
>
> You are responsible for the information on your tax return. Please provide complete and accurate information.
> If you are unsure about a question, choose "I'm not sure." A volunteer will follow up.
>
> 请提前准备：
> - 收到的税表，如 W-2、1099、1098、1095
> - 报税表上所有人的社会安全卡或 ITIN 信
> - 您和配偶的带照片身份证件（如驾照）
>
> 您需对报税表上的信息负责，请完整、准确地填写。如对某个问题不确定，请选择"不确定"，志愿者会跟进确认。

To report unethical behavior by a volunteer: ts.voltax@irs.gov / 如需举报志愿者的不当行为，请发送邮件至 ts.voltax@irs.gov

**Q0.1** Would you like to use the senior version of this form? / 是否使用长者版表格？
`form_version` · Single choice · Optional
- `general` No, use the standard version / 否，使用标准版
- `senior` Yes, use the senior version / 是，使用长者版
> Tip: You can change back any time with the Senior version switch at the top. Your answers are kept. / 您可以随时通过页面顶部的"长者版"开关改回，已填写的内容会保留。
> Note for developers: both versions use the same field IDs; only the wording changes. The standard version is the default.

**Q0.2** How would you like to get tax help? / 您希望以哪种方式获得报税帮助？
`service` · Single choice · Required
- `same_day` Same-day / 当天办理 · `drop_off` Drop-off / 送件办理 · `online` Online / 线上办理
> Note for developers: Q0.2–Q0.4 keep version 1's `service` and `language` answers, which the work board, office queue and case pool filter and display. They are not on the paper form, and their wording is new: the group should review it (the Chinese especially).

**Q0.3** Preferred service language / 首选服务语言
`language` · Single choice · Required
- `english` English / 英语 · `cantonese` Cantonese / 粤语 · `mandarin` Mandarin / 普通话 · `other` Other / 其他

**Q0.4** Please specify / 请说明
`language_other` · Text · Optional
**Show if** `language = other`

---

## Section 1: About You / 个人信息

**Q1.1** First name / 名
`tp_first_name` · Text · Required
> Tip: As shown on your Social Security card. / 请与社会安全卡上的拼写一致。

**Q1.2** Middle name / 中间名
`tp_middle_name` · Text · Optional
> Tip: Leave blank if you don't have one. / 如没有可留空。

**Q1.3** Last name / 姓
`tp_last_name` · Text · Required
> Tip: As shown on your Social Security card. / 请与社会安全卡上的拼写一致。

**Q1.4** Date of birth / 出生日期
`tp_dob` · Date · Required

**Q1.5** Occupation / 职业
`tp_job_title` · Text · Required
> Tip: For example: cook, cashier, driver, student, retired, unemployed. / 例如：厨师、收银员、司机、学生、退休、无业。

**Q1.6** Phone number / 电话号码
`tp_phone` · Phone · Required

**Q1.7** Email (optional) / 电子邮箱（选填）
`email` · Email · Optional


**Q1.8** Best time to reach you / 方便联系的时间
`best_contact_time` · Multi-select · Optional
- `weekday_morning` Weekday mornings / 工作日上午 · `weekday_afternoon` Weekday afternoons / 工作日下午 · `weekday_evening` Weekday evenings / 工作日晚上 · `weekend` Weekends / 周末 · `any_time` Any time / 任何时间
> Tip: Choose all that apply. A volunteer may call you with questions about your return. / 可多选。志愿者可能会就您的报税问题致电联系您。

**Q1.9** Notes about reaching you (optional) / 联系备注（选填）
`best_contact_note` · Text · Optional
> Tip: For example: after 6 PM, or text first. / 例如：下午 6 点以后，或请先发短信。
> Note for developers: not on the paper form (ViTally addition). The client, volunteers and admins can edit Q1.8–Q1.9.

---

## Section 2: Mailing Address / 邮寄地址

**Q2.1** Street address / 街道地址
`addr_street` · Text · Required
> Tip: The address where you receive mail. IRS letters will be sent here. / 请填写您的收信地址，国税局（IRS）的信件会寄到此地址。

**Q2.2** Apartment number / 公寓号
`addr_apt` · Text · Optional

**Q2.3** City / 城市
`addr_city` · Text · Required

**Q2.4** State / 州
`addr_state` · Text · Required
> Note for developers: the draft asked for a dropdown of US states. The catalogue has no list of states yet, so this is text until the group adds one.

**Q2.5** ZIP code / 邮编
`addr_zip` · ZIP · Required

---

## Section 3: Marital Status / 婚姻状况

**Q3.1** As of December 31, 2025, what was your marital status? / 截至 2025 年 12 月 31 日，您的婚姻状况是？
`marital_status` · Single choice · Required
- `never_married` Never married / 未婚
- `married` Married / 已婚
- `divorced` Divorced / 离婚
- `separated` Legally separated, but not divorced / 法定分居（未离婚）
- `widowed` Widowed / 丧偶

> Tip: "Legally separated" means you have a court-issued separation decree. Simply living apart does not count. / "法定分居"指法院已出具分居判决，仅分开居住不算。

**Q3.2** Were you married on the last day of 2025 (December 31)? / 2025 年最后一天（12 月 31 日），您是否仍处于已婚状态？
`married_last_day` · Yes / No · Required
**Show if** `marital_status = married`

**Q3.3** Did you and your spouse live apart for all of the last 6 months of 2025 (July 1 – December 31)? / 2025 年最后 6 个月（7 月 1 日至 12 月 31 日），您和配偶是否一直分开居住？
`lived_apart_last_6mo` · Yes / No · Required
**Show if** `marital_status = married`

**Q3.4** Date of final divorce decree / 离婚判决生效日期
`divorce_date` · Date · Required
**Show if** `marital_status = divorced`
> Tip: Found on your divorce decree. / 见法院离婚判决书。

**Q3.5** Date of separate maintenance decree / 法定分居判决日期
`separation_date` · Date · Required
**Show if** `marital_status = separated`
> Tip: Found on your court separation papers. / 见法院分居判决文件。

**Q3.6** Year of spouse's death / 配偶去世年份
`spouse_death_year` · Year · Required
**Show if** `marital_status = widowed`

---

## Section 4: Spouse Information / 配偶信息

> Note for developers: **Show this whole section if** `marital_status = married`. Each question below carries the rule.

**Q4.1** Spouse's first name / 配偶的名
`sp_first_name` · Text · Required
**Show if** `marital_status = married`
> Tip: As shown on their Social Security card. / 请与社会安全卡上的拼写一致。

**Q4.2** Spouse's middle name / 配偶的中间名
`sp_middle_name` · Text · Optional
**Show if** `marital_status = married`
> Tip: Leave blank if your spouse doesn't have one. / 如没有可留空。

**Q4.3** Spouse's last name / 配偶的姓
`sp_last_name` · Text · Required
**Show if** `marital_status = married`

**Q4.4** Spouse's date of birth / 配偶出生日期
`sp_dob` · Date · Required
**Show if** `marital_status = married`

**Q4.5** Spouse's occupation / 配偶职业
`sp_job_title` · Text · Required
**Show if** `marital_status = married`
> Tip: For example: cook, cashier, driver, student, retired, unemployed. / 例如：厨师、收银员、司机、学生、退休、无业。

**Q4.6** Spouse's phone number / 配偶电话号码
`sp_phone` · Phone · Optional
**Show if** `marital_status = married`

---

## Section 5: Your Situation in 2025 / 2025 年基本情况

> Note for developers: Use the "Who" multi-select (Me / My spouse / No one) for Q5.3–Q5.9.

**Q5.1** Did you live or work in two or more states in 2025? / 2025 年，您是否在两个或以上的州居住或工作过？
`multi_state` · Yes / No / Not sure · Required
> Tip: For example, you live in New York but work in New Jersey. / 例如：住在纽约州，在新泽西州工作。

**Q5.2** Can anyone else (such as a parent or adult child) claim you or your spouse as a dependent on their tax return? / 是否有其他人（如父母或成年子女）可以在其报税表上将您或配偶列为受抚养人？
`claimed_by_other` · Yes / No / Not sure · Required
> Tip: Common for students still supported by their parents. / 常见于仍由父母供养的学生。

**Q5.3** Who is a U.S. citizen? / 以下谁是美国公民？
`us_citizen` · Who (multi-select) · Required

**Q5.4** Who was in the U.S. on a visa in 2025? / 2025 年，以下谁持签证在美国？
`on_visa` · Who (multi-select) · Required
> Tip: For example, a student or work visa. A green card is **not** a visa. / 例如学生签证、工作签证。**绿卡不属于签证。**

**Q5.5** Who was a full-time student in 2025? / 2025 年，以下谁是全日制学生？
`fulltime_student` · Who (multi-select) · Required
> Tip: Enrolled full-time, as defined by the school, for at least 5 months of the year. / 指全年至少有 5 个月被学校认定为全日制在读。

**Q5.6** Who is legally blind? / 以下谁属于法定失明？
`legally_blind` · Who (multi-select) · Required
> Tip: Certified by a doctor; vision cannot be adequately corrected with glasses. / 需有医生证明，戴眼镜也无法充分矫正视力。

**Q5.7** Who is totally and permanently disabled? / 以下谁属于完全且永久性残疾？
`disabled` · Who (multi-select) · Required
> Tip: Certified by a doctor as unable to work due to a condition expected to last at least 1 year or be permanent. / 需有医生证明，因健康原因无法工作，且预计持续至少 1 年或永久。

**Q5.8** Who was issued an Identity Protection PIN (IP PIN)? / 以下谁持有国税局（IRS）发放的身份保护码（IP PIN）？
`ippin` · Who (multi-select) · Required
> Tip: A 6-digit number from the IRS, issued after identity theft or through voluntary sign-up. A new one is issued every year. If you have one, bring this year's letter (CP01A) or a screenshot from your IRS online account. You will upload it in the Documents step. / 国税局发放的 6 位数字，通常在身份被盗用后发放，也可自行申请，**每年更换**。如有，请准备今年的通知信（CP01A）或国税局网上账户截图。您将在「上传文件」步骤上传。

**Q5.9** Who owned or held any digital assets (such as Bitcoin, Ethereum, or other cryptocurrency) in 2025? / 2025 年，以下谁拥有或持有数字资产（如比特币、以太坊等加密货币）？
`digital_assets` · Who (multi-select) · Required

---

## Section 6: Household Members and Dependents / 家庭成员及受抚养人

**Intro text:**
> List **everyone who lived with you in 2025** (except your spouse), and **anyone you financially supported** who did not live with you.
> 请列出 2025 年与您同住的所有人（配偶除外），以及未与您同住但由您提供经济支持的人。

**Q6.0** Did anyone live with you or receive financial support from you in 2025? / 2025 年，是否有人与您同住或由您提供经济支持？
`has_household_members` · Yes / No · Required

**Q6.G** People in your household / 家庭成员
`hh` · Group · Required
**Show if** `has_household_members = yes`
> Note for developers: Repeatable group "Add a person / 添加成员" (the paper form has 4 rows; the online form can allow more). For each person:

**Q6.0m** Person id / 成员编号
`hh[i].member_id` · Hidden id · Optional
> Note for developers: never shown. "Add a person" generates it (32 lowercase hex characters); the server refuses a member without one.

**Q6.1** First name / 名
`hh[i].first_name` · Text · Required

**Q6.1b** Last name / 姓
`hh[i].last_name` · Text · Required
> Note for developers: Keep first and last name as separate fields to avoid order mix-ups.

**Q6.2** Date of birth / 出生日期
`hh[i].dob` · Date · Required

**Q6.3** Relationship to you / 与您的关系
`hh[i].relationship` · Single choice · Required
- `son_daughter` Son / Daughter / 子女
- `stepchild` Stepchild / 继子女
- `foster_child` Foster child / 寄养子女
- `grandchild` Grandchild / 孙子女/外孙子女
- `sibling` Brother / Sister / 兄弟姐妹
- `niece_nephew` Niece / Nephew / 侄子女/外甥子女
- `parent` Parent / 父母
- `grandparent` Grandparent / 祖父母/外祖父母
- `other_relative` Other relative / 其他亲属
- `none` None / 无亲属关系

**Q6.4** Number of months lived in your home in 2025 / 2025 年在您家居住的月数
`hh[i].months_lived` · Number 0–12 · Required
> Tip: If born in 2025 and lived with you since birth, enter 12. / 如 2025 年出生且出生后一直与您同住，请填 12。

**Q6.5** Marital status as of December 31, 2025 / 截至 2025 年 12 月 31 日的婚姻状况
`hh[i].married` · Single choice · Required
- `married` Married / 已婚
- `single` Single / 未婚

**Q6.6** U.S. citizen? / 是否为美国公民？
`hh[i].us_citizen` · Yes / No / Not sure · Required

**Q6.7** In 2025, was this person a resident of the U.S., Canada, or Mexico? / 2025 年，此人是否居住在美国、加拿大或墨西哥？
`hh[i].resident_na` · Yes / No / Not sure · Required

**Q6.8** Full-time student in 2025 (at least 5 months)? / 2025 年是否为全日制学生（至少 5 个月）？
`hh[i].fulltime_student` · Yes / No / Not sure · Required

**Q6.9** Totally and permanently disabled? / 是否为完全且永久性残疾？
`hh[i].disabled` · Yes / No / Not sure · Required

**Q6.10** Issued an IP PIN? / 是否持有身份保护码（IP PIN）？
`hh[i].ippin` · Yes / No / Not sure · Required
> Tip: If yes, bring this year's IP PIN letter (CP01A). You will upload it in the Documents step. / 如有，请准备今年的通知信（CP01A）。您将在「上传文件」步骤上传。

---

## Section 7: Refund and Payment / 退税与补税

**Q7.1** If you are due a refund, how would you like to receive it? / 如有退税，您希望以何种方式收取？
`refund_method` · Single choice · Required
- `direct_deposit` Direct deposit / 直接存入银行账户（最快）
- `check` Check by mail / 邮寄支票
- `split` Split between accounts / 分存多个账户
- `other` Other / 其他

> Tip (show if `refund_method ≠ check` AND `refund_method ≠ other`): Have your bank routing and account numbers ready. / 请准备好银行路由号码和账户号码。

**Q7.1a** Please specify / 请说明
`refund_method_other` · Text · Optional
**Show if** `refund_method = other`

**Q7.2** If you have a balance due, how would you like to pay? / 如需补税，您希望以何种方式付款？
`payment_method` · Single choice · Required
- `bank_account` Bank account (direct debit) / 从银行账户扣款
- `direct_pay` IRS.gov Direct Pay / 通过国税局网站（IRS.gov Direct Pay）自行付款
- `installment` Installment agreement / 申请分期付款
- `mail` Mail payment to the IRS / 邮寄付款给国税局

---

## Section 8: Language and Election Fund / 语言偏好与总统选举基金

**Q8.1** Would you like written communications from the IRS in a language other than English? / 您是否希望国税局用英语以外的语言与您书面沟通？
`irs_language_pref` · Who (multi-select) · Required

**Q8.2** Which language? / 哪种语言？
`irs_language` · Text · Optional
**Show if** `irs_language_pref ≠ none`
> Note for developers: the draft said "Dropdown / Text". It is text until the group lists the languages.

**Q8.3** Would you like $3 to go to the Presidential Election Campaign Fund? / 您是否愿意将 3 美元拨入总统选举竞选基金？
`pecf` · Who (multi-select) · Required
> Tip: **This does not increase your tax or reduce your refund.** / **不会增加您的税款，也不会减少您的退税。**

---

## Section 9: Income in 2025 / 2025 年收入

> Note for developers: Each item below is Yes / No / Not sure. Some items have follow-up questions.

**Q9.1** Wages from a part-time or full-time job / 工资（兼职或全职）
`inc_wages` · Yes / No / Not sure · Required
> Tip: Reported on Form **W-2**. / 对应 **W-2** 表。

**Q9.1a** How many jobs did you and your spouse have in 2025? / 2025 年您和配偶共有几份工作？
`inc_wages_job_count` · Number · Optional
**Show if** `inc_wages = yes`
> Tip: Usually one W-2 per job. / 通常一份工作对应一张 W-2。

**Q9.2** Tips / 小费
`inc_tips` · Yes / No / Not sure · Required
> Tip: All tips, including cash tips, are income. Some tips may be deductible starting in 2025. You will upload your tip records (your tip log, or the tip page of your app's tax summary) in the Documents step. / 所有小费（含现金小费）均需申报。自 2025 年起部分小费可能可以扣除。您将在「上传文件」步骤上传小费记录（自己记的小费账，或平台年度报税摘要中的小费页）。

**Q9.3** Retirement account, pension, or annuity distributions / 退休账户、养老金或年金收入
`inc_retirement` · Yes / No / Not sure · Required
> Tip: Such as a 401(k) or IRA. Reported on Form **1099-R**. / 如 401(k)、IRA，对应 **1099-R** 表。

**Q9.4** Disability benefits (from insurance or workers' compensation) / 残障补助（保险或工伤赔偿）
`inc_disability` · Yes / No / Not sure · Required
> Tip: W-2 or 1099-R for disability pay, or the benefit letter. You will upload it in the Documents step. / 残障补助的 W-2、1099-R 或补助通知信。您将在「上传文件」步骤上传。

**Q9.5** Social Security or Railroad Retirement benefits / 社会安全金或铁路退休金
`inc_social_security` · Yes / No / Not sure · Required
> Tip: Reported on Form **SSA-1099** or **RRB-1099**. / 对应 **SSA-1099** 或 **RRB-1099** 表。

**Q9.6** Unemployment benefits / 失业金
`inc_unemployment` · Yes / No / Not sure · Required
> Tip: Reported on Form **1099-G**. / 对应 **1099-G** 表。

**Q9.7** Refund of state or local income tax / 州或地方所得税退税
`inc_state_refund` · Yes / No / Not sure · Required
> Tip: 1099-G for the state or city tax refund. You will upload it in the Documents step. / 州或市退税 1099-G。您将在「上传文件」步骤上传。

**Q9.8** Interest or dividends (bank accounts, bonds, stocks, etc.) / 利息或股息（银行账户、债券、股票等）
`inc_interest_div` · Yes / No / Not sure · Required
> Tip: Reported on Form **1099-INT** or **1099-DIV**. / 对应 **1099-INT** 或 **1099-DIV** 表。

**Q9.9** Sale of stocks, bonds, or real estate / 出售股票、债券或房地产
`inc_sale_assets` · Yes / No / Not sure · Required
> Tip: Reported on Form **1099-B**. Document: the 1099-B and your full brokerage statement (and a 1099-S if the sale was real estate). You will upload it in the Documents step. / 对应 **1099-B** 表。文件：1099-B 及完整券商对账单（如卖的是房地产，还有 1099-S）。您将在「上传文件」步骤上传。

**Q9.9a** Did you report a loss from these sales on last year's return? / 去年的报税表是否申报过此类亏损？
`inc_sale_assets_prior_loss` · Yes / No / Not sure · Required
**Show if** `inc_sale_assets = yes`

**Q9.10** Alimony received (not child support) / 收到的赡养费（不含子女抚养费）
`inc_alimony` · Yes / No / Not sure · Required
> Tip: Divorce or separation agreement: the page with the date and the alimony terms. You will upload it in the Documents step. / 离婚或分居协议中写有日期和赡养费条款的页面。您将在「上传文件」步骤上传。

**Q9.11** Income from renting out your house or a room in your house / 出租房屋或房间的收入
`inc_rental_home` · Yes / No / Not sure · Required
> Tip: Rent records (income and costs), and any 1099-MISC or 1099-K for rent. You will upload it in the Documents step. / 租金收支记录，以及租金相关的 1099-MISC 或 1099-K。您将在「上传文件」步骤上传。

**Q9.11a** Did you also use it as your home AND rent it out for fewer than 15 days in 2025? / 该房屋是否同时为您的自住房，且 2025 年出租不足 15 天？
`inc_rental_home_under15` · Yes / No / Not sure · Required
**Show if** `inc_rental_home = yes`

**Q9.12** Income from renting out personal property (such as a vehicle or tools) / 出租个人物品（如车辆、工具）的收入
`inc_rental_property` · Yes / No / Not sure · Required
> Tip: Rent records and any 1099-MISC or 1099-K. You will upload it in the Documents step. / 出租记录及 1099-MISC 或 1099-K。您将在「上传文件」步骤上传。

**Q9.13** Gambling or lottery winnings / 赌博或彩票奖金
`inc_gambling` · Yes / No / Not sure · Required
> Tip: May be reported on Form **W-2G**. / 可能对应 **W-2G** 表。

**Q9.14** Income from contract or self-employment work / 合同工或自雇收入
`inc_self_employed` · Yes / No / Not sure · Required
> Tip: For example: delivery or rideshare apps, cleaning, selling goods. May be reported on Form **1099-NEC**, **1099-MISC**, or **1099-K**. If you drive or deliver with an app, also upload the app's yearly tax summary. / 例如：外卖或网约车平台、清洁服务、销售商品。可能对应 **1099-NEC**、**1099-MISC** 或 **1099-K** 表。如果您开网约车或送外卖，也请上传平台的年度报税摘要。

**Q9.14a** Did you report a loss from this work on last year's return? / 去年的报税表是否申报过此项亏损？
`inc_self_employed_prior_loss` · Yes / No / Not sure · Required
**Show if** `inc_self_employed = yes`

**Q9.15** Any other income? (Cash payments, jury duty, prizes or awards, digital assets, royalties, union strike benefits, etc.) / 其他收入？（如现金收入、陪审员报酬、奖品或奖励、数字资产、版税、工会罢工补助等）
`inc_other` · Yes / No / Not sure · Required
> Tip: Any form or statement for this income (for example, 1099-MISC, a jury duty pay letter, a union strike pay statement). You will upload it in the Documents step. / 该收入的任何税表或证明（如 1099-MISC、陪审报酬通知、工会罢工补助证明）。您将在「上传文件」步骤上传。

**Q9.15a** Please describe / 请说明收入类型
`inc_other_desc` · Text · Optional
**Show if** `inc_other = yes`

---

## Section 10: Expenses in 2025 / 2025 年支出

### Part A: Itemized Deduction Expenses / 可分项扣除的支出

> Note for developers: Each item is Yes / No / Not sure.

**Q10.1** Mortgage interest / 房贷利息
`exp_mortgage_interest` · Yes / No / Not sure · Required
> Tip: Reported on Form **1098**. / 对应 **1098** 表。

**Q10.2** Taxes paid: state, local, real estate, sales, etc. / 已缴税款：州税、地方税、房产税、销售税等
`exp_taxes` · Yes / No / Not sure · Required
> Tip: Property tax bill or receipt; receipts for large purchases with sales tax (for example, a car). You will upload it in the Documents step. / 房产税单或收据；大额消费的销售税收据（如买车）。您将在「上传文件」步骤上传。

**Q10.3** Medical, dental, or prescription expenses / 医疗、牙科或处方药费用
`exp_medical` · Yes / No / Not sure · Required
> Tip: Medical, dental, and prescription receipts, or a yearly summary from the pharmacy or insurer. You will upload it in the Documents step. / 医疗、牙科、处方药收据，或药房/保险公司的年度汇总。您将在「上传文件」步骤上传。

**Q10.4** Charitable contributions / 慈善捐款
`exp_charity` · Yes / No / Not sure · Required
> Tip: Donation receipts or thank-you letters. You will upload it in the Documents step. / 捐款收据或感谢信。您将在「上传文件」步骤上传。

### Part B: Other Expenses / 其他支出

**Q10.5** Student loan interest / 学生贷款利息
`exp_student_loan` · Yes / No / Not sure · Required
> Tip: Reported on Form **1098-E**. / 对应 **1098-E** 表。

**Q10.6** Child and dependent care (so you could work) / 为工作而支付的子女或受抚养人照护费用
`exp_dependent_care` · Yes / No / Not sure · Required
> Tip: Have the provider's name, address, and tax ID number ready. / 请准备好照护机构或人员的名称、地址和税号。

**Q10.7** Contributions to a retirement account (IRA, 401(k), etc.) / 退休账户供款（IRA、401(k) 等）
`exp_retirement_contrib` · Yes / No / Not sure · Required
> Tip: IRA contribution statement or receipt (Form 5498 if you have it). You will upload it in the Documents step. / IRA 供款证明或收据（如有 5498 表）。您将在「上传文件」步骤上传。

**Q10.8** Classroom supplies purchased as a teacher, teacher's aide, or other educator / 教师、助教或其他教育工作者自费购买的教学用品
`exp_educator` · Yes / No / Not sure · Required
> Tip: Receipts for classroom supplies. You will upload it in the Documents step. / 教学用品收据。您将在「上传文件」步骤上传。

**Q10.9** Alimony paid (not child support) / 支付的赡养费（不含子女抚养费）
`exp_alimony_paid` · Yes / No / Not sure · Required
> Tip: Have your former spouse's Social Security number ready. / 请准备好前配偶的社会安全号码。

---

## Section 11: Tax-Related Events in 2025 / 2025 年税务相关事项

> Note for developers: Each item is Yes / No / Not sure.

**Q11.1** You or a family member took classes (college, trade school, job-related training, etc.) / 您或家人参加过课程（大学、职业学校、职业培训等）
`evt_education` · Yes / No / Not sure · Required
> Tip: Form **1098-T** for each student, plus tuition, fee, and book receipts and any scholarship letter (and a 1099-Q if a 529 plan paid). You will upload it in the Documents step. / 每位学生的 **1098-T** 表，以及学费、杂费、书费收据和奖学金信（如由 529 计划支付，还有 1099-Q）。您将在「上传文件」步骤上传。

**Q11.2** Sold a home / 出售房屋
`evt_sold_home` · Yes / No / Not sure · Required
> Tip: 1099-S and the closing statements for the sale and for the original purchase. You will upload it in the Documents step. / 1099-S，以及卖房和当初买房的交割文件。您将在「上传文件」步骤上传。

**Q11.3** Had a Health Savings Account (HSA) / 持有健康储蓄账户（HSA）
`evt_hsa` · Yes / No / Not sure · Required
> Tip: 1099-SA and 5498-SA. You will upload it in the Documents step. / 1099-SA 和 5498-SA。您将在「上传文件」步骤上传。

**Q11.4** Purchased health insurance through the Marketplace (HealthCare.gov or a state exchange) / 通过医保交易市场（HealthCare.gov 或州交易平台）购买医疗保险
`evt_marketplace` · Yes / No / Not sure · Required
> Tip: Every Form **1095-A** you received. Medicaid and Medicare do not count. You will upload it in the Documents step. / 收到的所有 **1095-A** 表。Medicaid 和 Medicare 不属于此类。您将在「上传文件」步骤上传。

**Q11.5** Purchased and installed energy-efficient home improvements (windows, furnace, insulation, etc.) / 购买并安装节能家居改造（窗户、暖气炉、隔热材料等）
`evt_energy` · Yes / No / Not sure · Required
> Tip: Receipts or invoices showing each item, its cost, the labor cost (if listed separately), and the install date; the Qualified Manufacturer ID (QMID) for each item; any rebate or subsidy letter; the home energy audit report, if you had one. You will upload it in the Documents step. / 每项设备的收据或发票（含金额、单列的安装人工费、安装日期）；每项设备的制造商识别号（QMID）；任何返利或补贴证明；如做过家庭能源审计，请上传审计报告。您将在「上传文件」步骤上传。

**Q11.6** Other (for example: purchased a new vehicle) / 其他（例如购买新车）
`evt_other` · Yes / No / Not sure · Required

**Q11.6a** Please describe / 请说明
`evt_other_desc` · Text · Optional
**Show if** `evt_other = yes`
> Tip: If you bought a new vehicle with a loan, provide the 17-character VIN (on the purchase contract or registration). / 如贷款购买新车，请提供 17 位车辆识别号（VIN），可在购车合同或车辆登记证上找到。

**Q11.7** Had credit card, mortgage, or other debt canceled or forgiven by a lender / 信用卡、房贷或其他债务被贷款方取消或免除
`evt_debt_canceled` · Yes / No / Not sure · Required
> Tip: May be reported on Form **1099-C** or **1099-A**. / 可能对应 **1099-C** 或 **1099-A** 表。

**Q11.8** Had a loss in a federally declared disaster area / 在联邦宣布的灾区遭受损失
`evt_disaster` · Yes / No / Not sure · Required
> Tip: FEMA or insurance papers, and records of the loss. You will upload it in the Documents step. / FEMA 或保险理赔文件，以及损失记录。您将在「上传文件」步骤上传。

**Q11.9** Had a tax credit disallowed in a prior year (e.g., EITC, Child Tax Credit, American Opportunity Credit) / 以往年度是否有税收抵免被拒（如劳动所得抵免 EITC、儿童税收抵免 CTC、美国机会教育抵免 AOTC）
`evt_credit_disallowed` · Yes / No / Not sure · Required
> Tip: The IRS letter that denied the credit. You will upload it in the Documents step. / 国税局拒绝抵免的信。您将在「上传文件」步骤上传。

**Q11.10** Received any letter or bill from the IRS / 收到国税局的信件或账单
`evt_irs_letter` · Yes / No / Not sure · Required
> Tip: Each IRS letter or bill. You will upload it in the Documents step. / 每一封国税局信件或账单。您将在「上传文件」步骤上传。

**Q11.11** Made estimated tax payments or applied last year's refund to 2025 taxes / 缴纳过预估税，或将去年的退税用于抵缴 2025 年税款
`evt_estimated_payments` · Yes / No / Not sure · Required
> Tip: Payment records: IRS Direct Pay confirmations, IRS online account payment history, or cancelled checks. You will upload it in the Documents step. / 付款记录：国税局 Direct Pay 确认、网上账户付款记录或已兑现支票。您将在「上传文件」步骤上传。

**Q11.12** Do you have last year's tax return? / 您有去年的报税表吗？
`evt_brought_prior_return` · Yes / No · Required

---

## Section 12: Optional Questions (for statistics only) / 选填问题（仅用于统计）

**Page text:**
> These questions are **optional**. Your answers are **not** part of your tax return and are **not** sent to the IRS.
> 以下问题为**选填**。您的回答**不属于**报税表内容，也**不会**提交给国税局。

**Q12.1** How well can you carry on a conversation in English? / 您用英语交谈的能力如何？
`opt_english_speak` · Single choice · Optional
- `very_well` Very well / 很好
- `well` Well / 较好
- `not_well` Not well / 不太好
- `not_at_all` Not at all / 完全不会
- `prefer_not_to_answer` Prefer not to answer / 不愿回答

**Q12.2** How well can you read a newspaper in English? / 您阅读英文报纸的能力如何？
`opt_english_read` · Single choice · Optional
- `very_well` Very well / 很好
- `well` Well / 较好
- `not_well` Not well / 不太好
- `not_at_all` Not at all / 完全不会
- `prefer_not_to_answer` Prefer not to answer / 不愿回答

**Q12.3** Do you or any member of your household have a disability? / 您或家庭成员中是否有人有残疾？
`opt_household_disability` · Single choice · Optional
- `yes` Yes / 是
- `no` No / 否
- `prefer_not_to_answer` Prefer not to answer / 不愿回答

**Q12.4** Are you or your spouse a veteran of the U.S. Armed Forces? / 您或配偶是否为美国退伍军人？
`opt_veteran` · Single choice · Optional
- `yes` Yes / 是
- `no` No / 否
- `prefer_not_to_answer` Prefer not to answer / 不愿回答

**Q12.5** What is your race and/or ethnicity? (Select all that apply) / 您的种族和/或族裔？（可多选）
`opt_race_tp` · Multi-select · Optional
- `american_indian_alaska_native` American Indian or Alaska Native / 美洲原住民或阿拉斯加原住民
- `asian` Asian / 亚裔
- `black_african_american` Black or African American / 黑人或非裔美国人
- `hispanic_latino` Hispanic or Latino / 西班牙裔或拉丁裔
- `middle_eastern_north_african` Middle Eastern or North African / 中东或北非裔
- `native_hawaiian_pacific_islander` Native Hawaiian or Pacific Islander / 夏威夷原住民或太平洋岛民
- `white` White / 白人
- `prefer_not_to_answer` Prefer not to answer / 不愿回答
> Note for developers: `prefer_not_to_answer` *(added for online form)*.

> Note for developers: Show the examples from the paper form (e.g., "Chinese, Filipino, Vietnamese…") as small gray text under each option.

**Q12.6** What is your spouse's race and/or ethnicity? (Select all that apply) / 配偶的种族和/或族裔？（可多选）
`opt_race_sp` · Multi-select · Optional
**Show if** `marital_status = married`
- `american_indian_alaska_native` American Indian or Alaska Native / 美洲原住民或阿拉斯加原住民
- `asian` Asian / 亚裔
- `black_african_american` Black or African American / 黑人或非裔美国人
- `hispanic_latino` Hispanic or Latino / 西班牙裔或拉丁裔
- `middle_eastern_north_african` Middle Eastern or North African / 中东或北非裔
- `native_hawaiian_pacific_islander` Native Hawaiian or Pacific Islander / 夏威夷原住民或太平洋岛民
- `white` White / 白人
- `prefer_not_to_answer` Prefer not to answer / 不愿回答

> Note for developers: **Privacy notice:** Show the full "Privacy Act and Paperwork Reduction Act Notice" from page 4 of the paper form in a collapsible box, titled "How we use your information / 我们如何使用您的信息".

---

## Section 13: Additional Notes / 补充说明

**Q13.1** Anything else you'd like the volunteer to know? / 还有其他需要告知志愿者的信息吗？
`additional_notes` · Long text · Optional
> Tip: For example, a form you haven't received yet. / 例如：还没收到的税表。

---

## Section 14: Consent to Disclose Tax Return Information (Form 15080) / 报税信息披露同意书

**Page text (summary):**
> **This consent is optional. Declining will not affect the tax preparation service you receive.**
> **此同意书为自愿签署。不同意不会影响我们为您提供报税服务。**
>
> If you consent, TaxSlayer (the VITA/TCE software provider) may make your tax return information available to **any** VITA/TCE site using TaxSlayer that you visit next filing season, so your return can be pre-filled.
> 如您同意，TaxSlayer（VITA/TCE 报税软件提供商）可将您的报税信息提供给您明年前往的**任何**使用 TaxSlayer 的 VITA/TCE 报税点，用于自动预填。
>
> Information disclosed includes: name, address, date of birth, phone, SSN, filing status, occupation, employer, income, deductions, and credits, plus your dependents' names, SSNs, dates of birth, and relationship to you.
> 披露的信息包括：姓名、地址、出生日期、电话、社会安全号码、报税身份、职业、雇主、收入、扣除项和抵免项，以及受抚养人的姓名、社会安全号码、出生日期和与您的关系。
>
> This consent is valid through **November 30, 2027**.
> 本同意有效期至 **2027 年 11 月 30 日**。
>
> **Note:** Once disclosed, federal law may not protect your information from further use or distribution.
> **注意：**信息披露后，联邦法律可能无法防止其被进一步使用或传播。
>
> Consent is not needed for the site preparing your return this year; it only helps if you visit a **different** site next year.
> 今年为您报税的站点无需此同意；仅在您明年前往**其他**站点时有用。
>
> You have the right to receive a signed copy of this form.
> 您有权获得本表签署后的副本。

> Note for developers: Show the full original Form 15080 text in a collapsible box: "Read the full legal text / 阅读完整法律条款".

**Q14.1** Do you consent to this disclosure? / 您是否同意上述信息披露？
`gcf_consent` · Single choice · Optional
- `yes` I consent / 同意
- `no` I do not consent / 不同意

> Tip: If you wish to limit the duration or scope of the disclosure, choose **No**. / 如希望缩短有效期或限制披露范围，请选择**不同意**。

**Q14.2** Primary taxpayer signature (type full name) / 主报税人签名（输入全名）
`gcf_tp_signature` · Signature · Optional
**Show if** `gcf_consent = yes`

**Q14.3** Date / 日期
`gcf_tp_date` · Date · Optional
**Show if** `gcf_consent = yes`
> Note for developers: auto-fill today.

**Q14.4** Secondary taxpayer (spouse) signature (type full name) / 配偶签名（输入全名）
`gcf_sp_signature` · Signature · Optional
**Show if** `gcf_consent = yes` AND `marital_status = married`

**Q14.5** Spouse signature date / 配偶签名日期
`gcf_sp_date` · Date · Optional
**Show if** `gcf_consent = yes` AND `marital_status = married` AND `gcf_sp_signature` is filled
> Note for developers: auto-fill today.

**Footer text:**
> If you believe your tax return information has been disclosed or used improperly, contact TIGTA at **1-800-366-4484** or https://www.tigta.gov/reportcrime-misconduct
> 如您认为您的报税信息被不当披露或使用，请联系 TIGTA：**1-800-366-4484**，或访问上述网址。

---

## Appendix A: Volunteer-Only Fields (NOT shown on public form)

These are on the right side of the paper form, "To be completed by certified volunteer". Put them in the **volunteer back office**, not the taxpayer form.

| Paper form area | Volunteer fields |
|---|---|
| Page 1 household table | Qualifying child/relative of any other person; person provided >50% of own support; person had <$5,200 income; taxpayer provided >50% of support; taxpayer paid >half the cost of maintaining a home |
| Page 2 income | Counts of W-2, 1099-R, SSA-1099, 1099-G, 1099-INT, 1099-DIV, 1099-B, W-2G, 1099-MISC/NEC/K; QCD amount; state refund amount; itemized last year; capital loss carryover; alimony amount & excluded; rental expense; Schedule C expenses; other income; notes |
| Page 3 deductions | 1098 count; standard vs. itemized; 1098-E; child care credit; IRA; educator expense amount; alimony paid with spouse SSN; adjustment to income; notes |
| Page 3 events | Taxable scholarship; 1098-T; education credit; 1099-S; HSA contributions/distributions; 1095-A; Form 5695 Part II; VIN; 1099-C; 1099-A; disaster relief; credit disallowed year & reason; LITC referral; estimated payments; prior-year refund applied; prior-year return available; notes |

## Appendix B: Field ID Mapping to Paper Form

| Section | Paper form location |
|---|---|
| 1–4 | Form 13614-C p.1, top (personal info, address, marital status) |
| 5 | p.1, "Check if you or your spouse were in 2025" + two-states + claimed by others |
| 6 | p.1, household member table (taxpayer-answered columns only) |
| 7–8 | p.1, refund/payment, language, Presidential Election Campaign Fund |
| 9 | p.2, left side (Income) |
| 10–11 | p.3, left side (Expenses and Tax Related Events) |
| 12 | p.4 (Optional Information) |
| 13 | p.5 (Additional Notes) |
| 14 | Form 15080 (Global Carry Forward consent) |
